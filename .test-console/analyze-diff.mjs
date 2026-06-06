import { readFileSync } from "fs";
import { PNG } from "pngjs";

const a = PNG.sync.read(readFileSync("/tmp/sb.png"));
const b = PNG.sync.read(readFileSync("/tmp/rh.png"));
const w = a.width;
const h = a.height;

function lum(x, y, img) {
  const i = (y * w + x) * 4;
  return img.data[i] + img.data[i + 1] + img.data[i + 2];
}

let diff = 0;
const bands = { top: 0, mid: 0, bot: 0 };
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const dr = Math.abs(a.data[i] - b.data[i]);
    const dg = Math.abs(a.data[i + 1] - b.data[i + 1]);
    const db = Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (dr + dg + db > 20) {
      diff++;
      if (y < 260) bands.top++;
      else if (y < 650) bands.mid++;
      else bands.bot++;
    }
  }
}
console.log({ total: diff, pct: ((100 * diff) / (w * h)).toFixed(3), bands });

// sample first diff in ascii band y=44..120
for (let y = 44; y < 120; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const dr = Math.abs(a.data[i] - b.data[i]);
    const dg = Math.abs(a.data[i + 1] - b.data[i + 1]);
    const db = Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (dr + dg + db > 20) {
      console.log("ascii diff sample", { x, y, sb: [a.data[i], a.data[i + 1], a.data[i + 2]], rh: [b.data[i], b.data[i + 1], b.data[i + 2]] });
      process.exit(0);
    }
  }
}
