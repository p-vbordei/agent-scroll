import { expect, test } from "bun:test";
import { sealChain, verify } from "../src/index";
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

test("vertical slice: seal a 3-turn chain and verify round-trip", async () => {
  const chain = await sealChain([
    baseTurn(0, "what's the weather"),
    baseTurn(1, "sunny, 72F"),
    baseTurn(2, "thanks"),
  ]);
  expect(await verify(chain)).toEqual({ ok: true });
});

test("vertical slice: any single-byte mutation in any turn is detected", async () => {
  const chain = await sealChain([baseTurn(0, "a"), baseTurn(1, "b")]);
  const mutated = structuredClone(chain);
  // biome-ignore lint/style/noNonNullAssertion: test fixture — indices are known
  mutated[0]!.messages[0]!.content = "A"; // single character flip
  const result = await verify(mutated);
  expect(result.ok).toBe(false);
});

test("vertical slice: byte-determinism — two independent seals produce identical chains", async () => {
  const turns = [baseTurn(0, "x"), baseTurn(1, "y")];
  const a = await sealChain(turns);
  const b = await sealChain(turns);
  expect(a.map((t) => t.hash)).toEqual(b.map((t) => t.hash));
});
