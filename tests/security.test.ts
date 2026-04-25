import { expect, test } from "bun:test";
import * as ed from "@noble/ed25519";
import { hashCanonical, sealChain, verify } from "../src/index";
import type { Turn } from "../src/index";

const baseTurn = (n: number, content: string): Turn => ({
  version: "scroll/0.1",
  turn: n,
  role: n % 2 === 0 ? "user" : "assistant",
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  params: { temperature: 0, top_p: 1 },
  messages: [{ role: n % 2 === 0 ? "user" : "assistant", content }],
  timestamp_ns: 1_700_000_000_000_000_000 + n,
});

// SPEC §6 bullet 1: Tampering any byte inside a turn MUST change its hash.
test("tampering body bytes is detected (BadHash)", async () => {
  const chain = await sealChain([baseTurn(0, "secret"), baseTurn(1, "ack")]);
  const mutated = structuredClone(chain);
  // biome-ignore lint/style/noNonNullAssertion: test fixture — indices are known
  mutated[0]!.messages[0]!.content = "Secret"; // single capital flip
  const r = await verify(mutated);
  expect(r.ok).toBe(false);
});

// SPEC §6 bullet 1 (chain variant): Reordering turns breaks the chain.
test("reordering two turns is detected (BrokenChain or BadHash)", async () => {
  const chain = await sealChain([baseTurn(0, "a"), baseTurn(1, "b"), baseTurn(2, "c")]);
  const mutated = [chain[0], chain[2], chain[1]];
  const r = await verify(mutated);
  expect(r.ok).toBe(false);
});

// SPEC §6 bullet 2: Hash-only redaction — body omitted, hash binds.
test("redacted-at-write turn (hash only, body omitted) verifies", async () => {
  const argsObj = { token: "shhh" };
  const t: Turn = {
    ...baseTurn(0, "calling tool"),
    role: "assistant",
    tool_calls: [{ id: "tu_1", name: "x", args_hash: hashCanonical(argsObj) }],
  };
  const chain = await sealChain([t]);
  expect((await verify(chain)).ok).toBe(true);
});

// SPEC §6 bullet 2 (negative): post-hoc strip of plaintext breaks chain.
test("post-hoc strip of args body is detected (BadHash)", async () => {
  const argsObj = { token: "shhh" };
  const t: Turn = {
    ...baseTurn(0, "calling tool"),
    role: "assistant",
    tool_calls: [{ id: "tu_1", name: "x", args_hash: hashCanonical(argsObj), args: argsObj }],
  };
  const chain = await sealChain([t]);
  const stripped = structuredClone(chain);
  // biome-ignore lint/style/noNonNullAssertion: test fixture — indices are known
  // biome-ignore lint/performance/noDelete: intentional structural removal to test hash verification
  delete stripped[0]!.tool_calls![0]!.args;
  expect((await verify(stripped)).ok).toBe(false);
});

// SPEC §6 signature bullet: BadSignature is reported when sig is mutated.
test("flipping a signature byte is detected (BadSignature)", async () => {
  const privkey = ed.utils.randomPrivateKey();
  const pubkey = await ed.getPublicKeyAsync(privkey);
  const chain = await sealChain([baseTurn(0, "x")], { privkey, pubkey });
  const mutated = structuredClone(chain);
  // biome-ignore lint/style/noNonNullAssertion: test fixture — indices/values are known
  const sigBytes = Buffer.from(mutated[0]!.sig!.sig, "base64");
  // biome-ignore lint/style/noNonNullAssertion: test fixture — indices/values are known
  sigBytes[0] = sigBytes[0]! ^ 0x01;
  // biome-ignore lint/style/noNonNullAssertion: test fixture — indices/values are known
  mutated[0]!.sig!.sig = sigBytes.toString("base64");
  const r = await verify(mutated, pubkey);
  expect(r.ok).toBe(false);
});

// SPEC §6 bullet 3 (replay window): documented as out-of-scope for v0.1 — no test required.
// SPEC §6 bullet 4 (clock skew): timestamp_ns is informational only — no test required.
