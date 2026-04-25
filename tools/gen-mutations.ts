#!/usr/bin/env bun
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, join } from "node:path";

const VEC_DIR = "conformance/vectors";
const MUT_DIR = "conformance/vectors/mutations";

await mkdir(MUT_DIR, { recursive: true });

const files = (await readdir(VEC_DIR)).filter((f) => f.endsWith(".json") && !f.startsWith("mutations"));

for (const f of files) {
  const text = await readFile(join(VEC_DIR, f), "utf8");
  const chain = JSON.parse(text);
  // Flip first character inside the first message's content of turn 0.
  const original = chain[0].messages[0].content;
  const mutated = typeof original === "string"
    ? original.length > 0
      ? (original[0] === "x" ? "y" : "x") + original.slice(1)
      : "x"
    : original; // skip array-content vectors at this layer; they get a different mutation
  if (typeof original === "string") chain[0].messages[0].content = mutated;
  else {
    // Array content: flip a byte in the first block's serialized form by appending a marker char to a key.
    chain[0].messages[0].content = [...original, { type: "text", text: "TAMPERED" }];
  }
  const outName = basename(f, ".json") + "-tampered.json";
  await writeFile(join(MUT_DIR, outName), JSON.stringify(chain, null, 2));
}

console.log(`wrote ${files.length} mutation fixtures to ${MUT_DIR}`);
