/* delivery.ts — the rules behind a multi-file delivery, kept out of the drawer
   so they can be tested without a DOM.

   Every picked file carries its own scan verdict. Nothing is uploaded on the
   strength of another file's pass, and removing a file takes its verdict with
   it: re-adding the same name starts unverified again. */

export type Picked<T> = { file: T; ok: boolean };

/** append a batch, each file unverified until its own scan finishes */
export function addFiles<T>(picked: Picked<T>[], batch: T[]): Picked<T>[] {
  if (!batch.length) return picked;
  return [...picked, ...batch.map((file) => ({ file, ok: false }))];
}

/** drop one picked file — and the verdict it earned */
export function removeFile<T>(picked: Picked<T>[], target: T): Picked<T>[] {
  return picked.filter((p) => p.file !== target);
}

/** record one file's own verdict; every other file keeps theirs */
export function markScanned<T>(picked: Picked<T>[], target: T, ok: boolean): Picked<T>[] {
  return picked.map((p) => (p.file === target ? { ...p, ok } : p));
}

/** the step opens only on at least one file, every file passed, nothing scanning */
export function deliveryReady(picked: Array<{ ok: boolean }>, scanning: boolean): boolean {
  return picked.length > 0 && !scanning && picked.every((p) => p.ok);
}
