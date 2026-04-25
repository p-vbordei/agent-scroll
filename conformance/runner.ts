#!/usr/bin/env bun
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { verify } from "../src/verify";

const VEC_DIR = "conformance/vectors";
const MUT_DIR = "conformance/vectors/mutations";

let pass = 0, fail = 0;

const baseFiles = (await readdir(VEC_DIR)).filter((f) => f.endsWith(".json"));
for (const f of baseFiles) {
  const chain = JSON.parse(await readFile(join(VEC_DIR, f), "utf8"));
  const r = await verify(chain);
  if (r.ok) {
    pass++;
  } else {
    fail++;
    console.error(`BASE FAIL ${f}: ${JSON.stringify(r.failures)}`);
  }
}

const mutFiles = (await readdir(MUT_DIR)).filter((f) => f.endsWith(".json"));
for (const f of mutFiles) {
  const chain = JSON.parse(await readFile(join(MUT_DIR, f), "utf8"));
  const r = await verify(chain);
  if (!r.ok) {
    pass++;
  } else {
    fail++;
    console.error(`MUTATION SLIPPED ${f}: verify returned ok`);
  }
}

const total = baseFiles.length + mutFiles.length;
console.log(`conformance: PASS ${pass}/${total} (mutations rejected: ${mutFiles.length})`);
process.exit(fail === 0 ? 0 : 1);
