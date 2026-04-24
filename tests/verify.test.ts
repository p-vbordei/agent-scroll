import { expect, test } from "bun:test";
import * as ed from "@noble/ed25519";
import type { Turn } from "../src/schema";
import { sealChain } from "../src/seal";
import { verify } from "../src/verify";

const t = (n: number, content: string): Turn => ({
  version: "scroll/0.1",
  turn: n,
  role: n % 2 === 0 ? "user" : "assistant",
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  params: { temperature: 0, top_p: 1 },
  messages: [{ role: n % 2 === 0 ? "user" : "assistant", content }],
  timestamp_ns: 1_700_000_000_000_000_000 + n,
});

test("verify() returns ok for a freshly sealed chain", async () => {
  const chain = await sealChain([t(0, "hi"), t(1, "hello"), t(2, "thanks")]);
  expect(await verify(chain)).toEqual({ ok: true });
});

test("verify() flags BadHash when a turn body is mutated", async () => {
  const chain = await sealChain([t(0, "hi"), t(1, "hello")]);
  const mutated = structuredClone(chain);
  // biome-ignore lint/style/noNonNullAssertion: test fixture — indices are known
  mutated[1]!.messages[0]!.content = "GOTCHA";
  const result = await verify(mutated);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.failures.some((f) => f.turn === 1 && f.reason === "BadHash")).toBe(true);
  }
});

test("verify() flags BrokenChain when prev_hash is rewritten", async () => {
  const chain = await sealChain([t(0, "hi"), t(1, "hello")]);
  const mutated = structuredClone(chain);
  // biome-ignore lint/style/noNonNullAssertion: test fixture — indices are known
  mutated[1]!.prev_hash = `sha256:${"0".repeat(64)}`;
  // recompute hash so BadHash doesn't trip first
  // biome-ignore lint/style/noNonNullAssertion: test fixture — indices are known
  const { hash: _omit, sig: _omit2, ...turnOnly } = mutated[1]!;
  const { hashCanonical } = await import("../src/canonical");
  // biome-ignore lint/style/noNonNullAssertion: test fixture — indices are known
  mutated[1]!.hash = hashCanonical(turnOnly);
  const result = await verify(mutated);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.failures.some((f) => f.turn === 1 && f.reason === "BrokenChain")).toBe(true);
  }
});

test("verify() flags SchemaViolation on garbage input", async () => {
  const result = await verify([{ not: "a turn" }]);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.failures[0]?.reason).toBe("SchemaViolation");
  }
});

test("verify(chain, pubkey) returns ok for a signed chain", async () => {
  const privkey = ed.utils.randomPrivateKey();
  const pubkey = await ed.getPublicKeyAsync(privkey);
  const chain = await sealChain([t(0, "hi"), t(1, "hello")], { privkey, pubkey });
  expect(await verify(chain, pubkey)).toEqual({ ok: true });
});

test("verify(chain, pubkey) flags BadSignature on signature byte flip", async () => {
  const privkey = ed.utils.randomPrivateKey();
  const pubkey = await ed.getPublicKeyAsync(privkey);
  const chain = await sealChain([t(0, "hi")], { privkey, pubkey });
  const mutated = structuredClone(chain);
  // flip first base64 char (decode → flip → re-encode)
  // biome-ignore lint/style/noNonNullAssertion: test fixture — indices/values are known
  const sigBytes = Buffer.from(mutated[0]!.sig!.sig, "base64");
  // biome-ignore lint/style/noNonNullAssertion: test fixture — indices/values are known
  sigBytes[0] = sigBytes[0]! ^ 0x01;
  // biome-ignore lint/style/noNonNullAssertion: test fixture — indices/values are known
  mutated[0]!.sig!.sig = sigBytes.toString("base64");
  const result = await verify(mutated, pubkey);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.failures.some((f) => f.reason === "BadSignature")).toBe(true);
  }
});

test("verify(chain) without pubkey ignores signatures", async () => {
  const privkey = ed.utils.randomPrivateKey();
  const pubkey = await ed.getPublicKeyAsync(privkey);
  const chain = await sealChain([t(0, "hi")], { privkey, pubkey });
  // No pubkey passed → signature not checked → still ok if hash chain holds.
  expect(await verify(chain)).toEqual({ ok: true });
});
