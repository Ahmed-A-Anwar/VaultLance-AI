/* canvasFeather.ts — the phone band crops the vault frame top and bottom, and a
   CSS mask is not a dependable way to soften that crop: engines that have not
   shipped mask-image drop it and leave the frame's own shadow cut off dead
   straight, WebKit has been known to paint the masked-out rows black, and a mask
   on an element that is being translated can leave a one-pixel seam where the
   layer ends. Writing the fade into the canvas pixels instead works the same
   everywhere, so that is what the phone layout does (the mask is switched off
   there in hero.css). */

/* same breakpoint as the phone rules in hero.css */
export const phoneBand = () =>
  typeof window !== "undefined" && window.innerWidth <= 767;

/* erase a soft band at the top and bottom, in the canvas's own coordinate
   space (call it while the drawing transform is still the CSS-pixel one).
   28-56px, or 12% of a short band: the frame's contact shadow sits well inside
   that, so a crop through it fades out instead of ending in a line. */
export const featherBand = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  px = 0,
) => {
  if (w <= 0 || h <= 0) return;
  const band = px > 0 ? px : Math.round(Math.min(56, Math.max(28, h * 0.12)));
  const edge = Math.min(0.5, band / h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "rgba(0, 0, 0, 1)");
  g.addColorStop(edge, "rgba(0, 0, 0, 0)");
  g.addColorStop(1 - edge, "rgba(0, 0, 0, 0)");
  g.addColorStop(1, "rgba(0, 0, 0, 1)");
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
};

/* the phone band's feather, read live: one canvas serves every width, so this
   decides per paint rather than once when a player is created */
export const featherPhoneBand = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
) => {
  if (phoneBand()) featherBand(ctx, w, h);
};
