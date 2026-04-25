import { canonical } from "../src/canonical";
import expectedHex from "./fixtures/c1-hex.json" with { type: "json" };
import turns from "./fixtures/c1-turns.json" with { type: "json" };

export default async function c1(): Promise<void> {
  const hexMap = expectedHex as Record<string, string>;
  const turnsArr = turns as unknown[];

  for (const [k, t] of Object.entries(turnsArr)) {
    const bytes = canonical(t);
    const actual = Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("");
    const expected = hexMap[k];
    if (expected === undefined) throw new Error(`C1: missing expected hex for index ${k}`);
    if (actual !== expected) {
      throw new Error(
        `C1: turn ${k} mismatch\n  actual:   ${actual.slice(0, 80)}...\n  expected: ${expected.slice(0, 80)}...`,
      );
    }
  }

  if (Object.keys(hexMap).length < 20) {
    throw new Error(`C1: expected at least 20 vectors, got ${Object.keys(hexMap).length}`);
  }
}
