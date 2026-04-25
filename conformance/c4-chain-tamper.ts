import * as ed from "@noble/ed25519";
import type { Turn } from "../src/schema";
import { sealChain } from "../src/seal";
import { verify } from "../src/verify";

function makeTurn(i: number, content: string): Turn {
  return {
    version: "scroll/0.1",
    turn: i,
    role: i % 2 === 0 ? "user" : "assistant",
    model: { vendor: "anthropic", id: "claude-sonnet-4-5" },
    params: { temperature: 0, top_p: 1 },
    messages: [{ role: i % 2 === 0 ? "user" : "assistant", content }],
    timestamp_ns: 1700000000000000000 + i,
  };
}

export default async function c4(): Promise<void> {
  const privkey = ed.utils.randomPrivateKey();
  const pubkey = await ed.getPublicKeyAsync(privkey);

  const rawTurns: Turn[] = [
    makeTurn(0, "First message"),
    makeTurn(1, "Second message"),
    makeTurn(2, "Third message"),
    makeTurn(3, "Fourth message"),
    makeTurn(4, "Fifth message"),
  ];

  const chain = await sealChain(rawTurns, { privkey, pubkey });
  if (chain.length !== 5) throw new Error("C4: expected 5-turn chain");

  // Baseline: valid chain must pass
  const baseline = await verify(chain, pubkey);
  if (!baseline.ok) throw new Error(`C4: baseline chain invalid: ${JSON.stringify(baseline)}`);

  // Tamper 1: swap turns[1] and turns[2]
  const swapped = [chain[0]!, chain[2]!, chain[1]!, chain[3]!, chain[4]!];
  const r1 = await verify(swapped, pubkey);
  if (r1.ok) throw new Error("C4(1): swapped turns should fail verify but passed");

  // Tamper 2: mutate prev_hash of turns[3]
  const t3mutated = { ...chain[3]!, prev_hash: `sha256:${"a".repeat(64)}` };
  const brokenPrev = [chain[0]!, chain[1]!, chain[2]!, t3mutated, chain[4]!];
  const r2 = await verify(brokenPrev, pubkey);
  if (r2.ok) throw new Error("C4(2): mutated prev_hash should fail verify but passed");

  // Tamper 3: mutate hash of turns[2]
  const t2mutatedHash = { ...chain[2]!, hash: `sha256:${"b".repeat(64)}` };
  const brokenHash = [chain[0]!, chain[1]!, t2mutatedHash, chain[3]!, chain[4]!];
  const r3 = await verify(brokenHash, pubkey);
  if (r3.ok) throw new Error("C4(3): mutated hash should fail verify but passed");
}
