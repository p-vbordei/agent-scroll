import c1 from "./c1-byte-equality";
import c2 from "./c2-mutation";
import c3 from "./c3-roundtrip";
import c4 from "./c4-chain-tamper";

const vectors: Array<[string, () => Promise<void>]> = [
  ["C1 — canonical byte equality", c1],
  ["C2 — single-byte mutation detection", c2],
  ["C3 — serialize/deserialize roundtrip", c3],
  ["C4 — chain tamper / reorder detection", c4],
];

let failed = 0;
for (const [name, run] of vectors) {
  const t = Date.now();
  try {
    await run();
    console.log(`PASS  ${name}  (${Date.now() - t} ms)`);
  } catch (err) {
    failed += 1;
    console.log(`FAIL  ${name}`);
    console.error(err);
  }
}
console.log(`${vectors.length - failed}/${vectors.length} vectors passed`);
process.exit(failed === 0 ? 0 : 1);
