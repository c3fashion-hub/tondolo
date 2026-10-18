// Builds the home-screen icons from the design system's app icon (draft artwork).
// Run with: npm run icons
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";

const seeds = (cx, cy, rx, ry, k) =>
  [[0, -152], [144.6, -47], [89.3, 123], [-89.3, 123], [-144.6, -47]]
    .map(([dx, dy], i) => `<ellipse cx="${cx + dx * k}" cy="${cy + dy * k}" rx="${rx}" ry="${ry}" fill="#3B1631" transform="rotate(${i * 72} ${cx + dx * k} ${cy + dy * k})"/>`)
    .join("");

// rx: corner radius of the raspberry square (0 = full bleed, for maskable and Apple).
const appIcon = (rx) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="${rx}" fill="#C2255C"/>
  <circle cx="512" cy="512" r="304" fill="#FFF8F5"/>
  <circle cx="512" cy="512" r="304" fill="none" stroke="#C5D86D" stroke-width="24"/>
  ${seeds(512, 512, 40, 66, 1)}
</svg>`;

const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <circle cx="48" cy="48" r="46" fill="#C2255C"/>
  <circle cx="48" cy="48" r="34" fill="#FFF8F5"/>
  ${seeds(48, 48, 4.5, 7.5, 17 / 152)}
</svg>`;

mkdirSync("public/icons", { recursive: true });
const png = (svg, size, out) => sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);
await png(appIcon(224), 192, "public/icons/icon-192.png");
await png(appIcon(224), 512, "public/icons/icon-512.png");
await png(appIcon(0), 512, "public/icons/maskable-512.png");
await png(appIcon(0), 180, "src/app/apple-icon.png");
writeFileSync("src/app/icon.svg", mark + "\n");
console.log("Icons written.");
