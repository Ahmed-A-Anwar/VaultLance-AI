/* clipWorker.ts — fetches the clip's frames and decodes them off the main thread.

   createImageBitmap() decodes on whatever thread calls it, and on the main thread
   a batch of 1920x1080 frames takes long enough to starve the animation loop it
   is meant to feed. Doing the work here keeps the playhead on time and the
   entrance smooth: the worker holds the compressed bytes, decodes in parallel and
   transfers each bitmap over, so the main thread only draws. */

type Request =
  | { type: "init"; urls: string[] }
  | { type: "decode"; index: number };

export type Reply =
  | { type: "ready" }
  | { type: "fetched"; index: number; ok: boolean }
  | { type: "frame"; index: number; bitmap: ImageBitmap }
  | { type: "decode-failed"; index: number };

/* requests in flight at once. Batches that wait for their slowest frame cost a
   full round trip per batch, and a cold edge takes ~0.7s to first byte: 49
   frames in batches of 8 measured ten seconds, the same frames in one sliding
   window about three. A slot frees, the next request starts. */
const FETCH_WINDOW = 14;
/* bitmaps decoded at once: enough to keep the pipeline full without holding a
   long queue of full-resolution surfaces */
const DECODE_BATCH = 4;

let urls: string[] = [];
let blobs: (Blob | null)[] = [];
let got: boolean[] = [];
/* fetch and decode advance as counters fed by promises, not as loops that await
   a batch: neither one can stall the other */
let fetchNext = 0;
let fetchBusy = 0;
let decodeNext = 0;
let decodeBusy = 0;

const post = (reply: Reply, transfer: Transferable[] = []) => {
  (self as unknown as Worker).postMessage(reply, transfer);
};

const getBlob = async (i: number): Promise<Blob | null> => {
  if (got[i]) return blobs[i];
  try {
    const res = await fetch(urls[i], { cache: "force-cache" });
    if (!res.ok) throw new Error(String(res.status));
    blobs[i] = await res.blob();
  } catch {
    /* a single bad frame leaves a hold, not a failed clip */
    blobs[i] = null;
  } finally {
    got[i] = true;
    post({ type: "fetched", index: i, ok: blobs[i] !== null });
  }
  return blobs[i];
};

const decodeAndPost = async (i: number) => {
  const blob = got[i] ? blobs[i] : await getBlob(i);
  if (!blob) {
    post({ type: "decode-failed", index: i });
    return;
  }
  try {
    const bitmap = await createImageBitmap(blob);
    post({ type: "frame", index: i, bitmap }, [bitmap]);
  } catch {
    post({ type: "decode-failed", index: i });
  }
};

const pumpFetch = () => {
  while (fetchBusy < FETCH_WINDOW && fetchNext < urls.length) {
    const i = fetchNext++;
    fetchBusy += 1;
    void getBlob(i).then(() => {
      fetchBusy -= 1;
      pumpFetch();
      pumpDecode();
    });
  }
};

/* frames decode in index order: the page counts the contiguous run from zero, so
   an out-of-order decode would hold its progress back. A frame that fails is
   stepped over instead of blocking the ones behind it. */
const pumpDecode = () => {
  while (decodeBusy < DECODE_BATCH && decodeNext < urls.length && got[decodeNext]) {
    const i = decodeNext++;
    decodeBusy += 1;
    void decodeAndPost(i).then(() => {
      decodeBusy -= 1;
      pumpDecode();
    });
  }
};

const run = () => {
  if (!urls.length) return;
  pumpFetch();
  pumpDecode();
};

self.onmessage = (e: MessageEvent<Request>) => {
  const msg = e.data;
  if (msg.type === "init") {
    /* the module ran: say so before fetching, so the page can tell a worker
       that never started from one that is merely waiting on the network */
    post({ type: "ready" });
    urls = msg.urls;
    blobs = new Array<Blob | null>(urls.length).fill(null);
    got = new Array<boolean>(urls.length).fill(false);
    fetchNext = 0;
    fetchBusy = 0;
    decodeNext = 0;
    decodeBusy = 0;
    run();
    return;
  }
  if (msg.type === "decode") {
    if (msg.index >= 0 && msg.index < urls.length) void decodeAndPost(msg.index);
  }
};
