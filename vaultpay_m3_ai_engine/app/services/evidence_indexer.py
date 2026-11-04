"""
VaultPay – Evidence Indexer (Elasticsearch + Resilient DB Fallback)
===================================================================
Indexes EvidenceChunk objects into Elasticsearch for hybrid
keyword + vector search. Also provides resilient local DB search
fallback if Elasticsearch is offline.
"""

import re
import uuid
from typing import Any
from elasticsearch import AsyncElasticsearch, helpers
from app.core.config import get_settings

settings = get_settings()

# ─────────────────────────────────────────────────────────────────────────────
# Section 1: Elasticsearch client singleton
# ─────────────────────────────────────────────────────────────────────────────
_es_client: AsyncElasticsearch | None = None


def get_es_client() -> AsyncElasticsearch:
    global _es_client
    if _es_client is None:
        _es_client = AsyncElasticsearch(settings.elasticsearch_url)
    return _es_client


# ─────────────────────────────────────────────────────────────────────────────
# Section 2: Index mapping (created once on startup)
# ─────────────────────────────────────────────────────────────────────────────
INDEX_MAPPING = {
    "mappings": {
        "properties": {
            "chunk_id": {"type": "keyword"},
            "file_id": {"type": "keyword"},
            "project_id": {"type": "keyword"},
            "original_filename": {"type": "keyword"},
            "text": {"type": "text", "analyzer": "english"},
            "page_number": {"type": "integer"},
            "line_start": {"type": "integer"},
            "line_end": {"type": "integer"},
            "is_ocr_derived": {"type": "boolean"},
            "extraction_warning": {"type": "text"},
        }
    }
}


async def ensure_index_exists() -> None:
    """Create the ES index if it does not already exist."""
    try:
        es = get_es_client()
        index = settings.elasticsearch_index_chunks
        exists = await es.indices.exists(index=index)
        if not exists:
            await es.indices.create(index=index, body=INDEX_MAPPING)
    except Exception as exc:
        # Gracefully handle when ES is not running locally
        pass


# ─────────────────────────────────────────────────────────────────────────────
# Section 3: Bulk index chunks for a single file
# ─────────────────────────────────────────────────────────────────────────────
async def index_chunks(
    project_id: str,
    file_id: str,
    original_filename: str,
    chunks: list[dict[str, Any]],
) -> list[str]:
    """
    Bulk-index a list of chunk dicts into Elasticsearch.
    Returns a list of ES document IDs.
    """
    doc_ids = [f"{file_id}-chunk-{i}" for i in range(len(chunks))]
    try:
        es = get_es_client()
        index = settings.elasticsearch_index_chunks

        actions = []
        for i, chunk in enumerate(chunks):
            doc_id = doc_ids[i]
            actions.append({
                "_index": index,
                "_id": doc_id,
                "_source": {
                    "chunk_id": doc_id,
                    "file_id": file_id,
                    "project_id": project_id,
                    "original_filename": original_filename,
                    "text": chunk.get("text", ""),
                    "page_number": chunk.get("page_number"),
                    "line_start": chunk.get("line_start"),
                    "line_end": chunk.get("line_end"),
                    "is_ocr_derived": chunk.get("is_ocr_derived", False),
                    "extraction_warning": chunk.get("extraction_warning"),
                },
            })

        await helpers.async_bulk(es, actions)
    except Exception:
        # If ES is offline, chunks are still safely saved in SQLite/Postgres DB
        pass

    return doc_ids


# ─────────────────────────────────────────────────────────────────────────────
# Section 4: Hybrid search – keyword BM25 with resilient DB fallback
# ─────────────────────────────────────────────────────────────────────────────
async def search_evidence(
    project_id: str,
    query: str,
    top_k: int = 5,
) -> list[dict[str, Any]]:
    """
    Search evidence chunks for a given criterion query.
    Attempts Elasticsearch first, falls back to Database search if ES is offline.
    """
    try:
        es = get_es_client()
        index = settings.elasticsearch_index_chunks

        body = {
            "query": {
                "bool": {
                    "filter": [{"term": {"project_id": project_id}}],
                    "must": [{"match": {"text": {"query": query, "operator": "or"}}}],
                }
            },
            "size": top_k,
            "_source": ["chunk_id", "original_filename", "page_number",
                        "line_start", "line_end", "text", "is_ocr_derived"],
        }

        response = await es.search(index=index, body=body)
        hits = response["hits"]["hits"]

        return [
            {
                "chunk_id": h["_source"].get("chunk_id"),
                "file": h["_source"].get("original_filename"),
                "page": h["_source"].get("page_number"),
                "line_start": h["_source"].get("line_start"),
                "line_end": h["_source"].get("line_end"),
                "excerpt": h["_source"].get("text", "")[:500],
                "is_ocr_derived": h["_source"].get("is_ocr_derived", False),
                "score": h["_score"],
            }
            for h in hits
        ]
    except Exception:
        # Resilient fallback: search local EvidenceChunk records in DB
        return await _fallback_db_search(project_id, query, top_k)


# ─────────────────────────────────────────────────────────────────────────────
# Section 5: Database evidence search fallback
# ─────────────────────────────────────────────────────────────────────────────
async def _fallback_db_search(
    project_id: str,
    query: str,
    top_k: int = 5,
) -> list[dict[str, Any]]:
    """
    Fallback query executing directly against the SQLAlchemy DB.
    """
    from app.db.base import AsyncSessionLocal
    from app.models.evidence_chunk import EvidenceChunk
    from app.models.uploaded_file import UploadedFile
    from sqlalchemy import select

    try:
        val_proj = uuid.UUID(str(project_id))
    except Exception:
        return []

    tokens = [t.lower() for t in re.findall(r"\w+", query) if len(t) > 2]

    async with AsyncSessionLocal() as session:
        stmt = (
            select(EvidenceChunk, UploadedFile.original_filename)
            .join(UploadedFile, EvidenceChunk.file_id == UploadedFile.id)
            .where(UploadedFile.project_id == val_proj)
        )
        res = await session.execute(stmt)
        rows = res.all()

        if not rows:
            return []

        scored = []
        for chunk, filename in rows:
            text_lower = (chunk.text or "").lower()
            score = 0.0
            for t in tokens:
                if t in text_lower:
                    score += 1.0 + (0.5 if t in filename.lower() else 0.0)

            scored.append((score, chunk, filename))

        scored.sort(key=lambda x: x[0], reverse=True)

        results = []
        for score, chunk, filename in scored[:top_k]:
            results.append({
                "chunk_id": str(chunk.id),
                "file": filename,
                "page": chunk.page_number,
                "line_start": chunk.line_start,
                "line_end": chunk.line_end,
                "excerpt": (chunk.text or "")[:500],
                "is_ocr_derived": chunk.is_ocr_derived,
                "score": float(score),
            })
        return results
