import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Reads the tokens from the real stylesheet so this test can't drift from it.
const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");

function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z-]+):\s*(#[0-9A-Fa-f]{6})\b/g)) out[m[1]] = m[2];
  return out;
}
const light = tokens(css.slice(css.indexOf(":root {"), css.indexOf("@media (prefers-color-scheme: dark)")));
const dark = { ...light, ...tokens(css.slice(css.indexOf(':root[data-theme="dark"]'), css.indexOf("*, *::before"))) };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Text colour on background, as used on the screens.
const PAIRS: [string, string][] = [
  ["ink", "paper"], ["ink", "surface"], ["ink", "sugar"], ["on-lime", "lime"],
  ["ink-muted", "paper"], ["ink-muted", "surface"],
  ["raspberry-ink", "paper"], ["raspberry-ink", "surface"],
  ["on-raspberry", "raspberry"], ["on-aubergine", "aubergine"],
  ["leaf", "leaf-soft"], ["amber", "amber-soft"], ["alert", "alert-soft"],
  ["alert", "surface"], ["alert", "paper"], ["leaf", "paper"],
];

for (const [name, theme] of [["light", light], ["dark", dark]] as const) {
  test(`text pairs pass 4.5:1 in the ${name} theme`, () => {
    for (const [fg, bg] of PAIRS) {
      assert.ok(theme[fg] && theme[bg], `missing token ${fg} or ${bg}`);
      const r = ratio(theme[fg], theme[bg]);
      assert.ok(r >= 4.5, `${fg} on ${bg} is ${r.toFixed(2)}:1`);
    }
  });
}
