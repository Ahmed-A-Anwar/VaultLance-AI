const lum = (hex) => {
  const c = hex.replace("#", "").match(/.{2}/g).map((h) => parseInt(h, 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return +((l1 + 0.05) / (l2 + 0.05)).toFixed(2);
};

const bgs = { top: "#c9d0d2", mid: "#d5dbdc", bottom: "#e1e7e8" };
const fgs = { ink: "#0e1520", slate: "#4b5663", steel: "#8a95a1", brass: "#b8893a" };
for (const [name, bg] of Object.entries(bgs)) {
  const row = Object.fromEntries(Object.entries(fgs).map(([k, v]) => [k, ratio(v, bg)]));
  console.log(name, bg, row);
}
