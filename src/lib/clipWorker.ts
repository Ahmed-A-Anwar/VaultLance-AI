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
  | { type: "fetched"; index: number; ok: boolean }
  | { type: "frame"; index: number; bitmap: ImageBitmap }
  | { type: "decode-failed"; index: number };

/* requests in flight at once; the browser multiplexes them over one connection */
const FETCH_BATCH = 8;
/* bitmaps decoded at once: enough to keep the pipeline full without holding a
   long queue of full-resolution surfaces */
const DECODE_BATCH = 4;

let urls: string[] = [];
let blobs: (Blob | null)[] = [];
let got: boolean[] = [];
let runToken = 0;

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

/* frame 0 first so the clip is drawable, then the rest decodes in batches */
const run = async (token: number) => {
  if (!urls.length) return;
  await decodeAndPost(0);
  for (let i = 1; i < urls.length; i += FETCH_BATCH) {
    if (token !== runToken) return;
    const batch: Promise<Blob | null>[] = [];
    for (let k = i; k < Math.min(i + FETCH_BATCH, urls.length); k++) batch.push(getBlob(k));
    await Promise.all(batch);
    if (token !== runToken) return;
    for (let k = i; k < Math.min(i + FETCH_BATCH, urls.length); k += DECODE_BATCH) {
      const group: Promise<void>[] = [];
      for (let j = k; j < Math.min(k + DECODE_BATCH, i + FETCH_BATCH); j++) group.push(decodeAndPost(j));
      await Promise.all(group);
      if (token !== runToken) return;
    }
  }
};

self.onmessage = (e: MessageEvent<Request>) => {
  const msg = e.data;
  if (msg.type === "init") {
    urls = msg.urls;
    blobs = new Array<Blob | null>(urls.length).fill(null);
    got = new Array<boolean>(urls.length).fill(false);
    runToken += 1;
    void run(runToken);
    return;
  }
  if (msg.type === "decode") {
    if (msg.index >= 0 && msg.index < urls.length) void decodeAndPost(msg.index);
  }
};
