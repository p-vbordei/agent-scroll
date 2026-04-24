import { expect, test } from "bun:test";
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
