import { expect, test } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { verify } from "../src/verify";

const VEC_DIR = "conformance/vectors";
const MUT_DIR = "conformance/vectors/mutations";

test("every base vector verifies", async () => {
  const files = (await readdir(VEC_DIR)).filter((f) => /^\d{3}-/.test(f) && f.endsWith(".json"));
  expect(files.length).toBeGreaterThanOrEqual(20);
  for (const f of files) {
    const chain = JSON.parse(await readFile(join(VEC_DIR, f), "utf8"));
    const r = await verify(chain);
    expect({ file: f, ok: r.ok }).toEqual({ file: f, ok: true });
  }
});

test("every mutation is rejected", async () => {
  const files = (await readdir(MUT_DIR)).filter((f) => f.endsWith(".json"));
  expect(files.length).toBeGreaterThanOrEqual(20);
  for (const f of files) {
    const chain = JSON.parse(await readFile(join(MUT_DIR, f), "utf8"));
    const r = await verify(chain);
    expect({ file: f, ok: r.ok }).toEqual({ file: f, ok: false });
  }
});
