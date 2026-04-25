import { expect, test } from "bun:test";
import { canonical, hashCanonical } from "../src/canonical";

test("canonical is byte-identical regardless of key order", () => {
  const a = canonical({ b: 1, a: 2 });
  const b = canonical({ a: 2, b: 1 });
  expect(a).toEqual(b);
  expect(new TextDecoder().decode(a)).toBe('{"a":2,"b":1}');
});

test("canonical sorts nested keys deterministically", () => {
  const s = new TextDecoder().decode(canonical({ z: { y: 1, x: 2 }, a: 0 }));
  expect(s).toBe('{"a":0,"z":{"x":2,"y":1}}');
});

test("hashCanonical returns 'sha256:' + 64 hex chars", () => {
  const h = hashCanonical({ hello: "world" });
  expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
});

test("hashCanonical of {a:1,b:2} equals known JCS hash", () => {
  // canonical = '{"a":1,"b":2}' = bytes 7b2261223a312c2262223a327d
  // sha256 of those 13 bytes = 43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777
  expect(hashCanonical({ b: 2, a: 1 })).toBe(
    "sha256:43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777",
  );
});
