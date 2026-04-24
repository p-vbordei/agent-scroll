import { expect, test } from "bun:test";
import { hashCanonical, sealChain, verify } from "../src/index";
import type { Turn } from "../src/index";

const argsObj = { ssn: "123-45-6789" };

test("a turn that omits args plaintext (hash-only) seals and verifies", async () => {
  const t: Turn = {
    version: "scroll/0.1",
    turn: 0,
    role: "assistant",
    model: { vendor: "anthropic", id: "claude-opus-4-7" },
    params: { temperature: 0, top_p: 1 },
    messages: [{ role: "assistant", content: "checking" }],
    tool_calls: [
      {
        id: "tu_1",
        name: "lookup",
        args_hash: hashCanonical(argsObj),
        // args INTENTIONALLY omitted — PII redacted
      },
    ],
    timestamp_ns: 1_700_000_000_000_000_000,
  };
  const chain = await sealChain([t]);
  expect(await verify(chain)).toEqual({ ok: true });
});

test("stripping args after sealing breaks the chain (intended)", async () => {
  const t: Turn = {
    version: "scroll/0.1",
    turn: 0,
    role: "assistant",
    model: { vendor: "anthropic", id: "claude-opus-4-7" },
    params: { temperature: 0, top_p: 1 },
    messages: [{ role: "assistant", content: "checking" }],
    tool_calls: [{ id: "tu_1", name: "lookup", args_hash: hashCanonical(argsObj), args: argsObj }],
    timestamp_ns: 1_700_000_000_000_000_000,
  };
  const chain = await sealChain([t]);
  const stripped = structuredClone(chain);
  // biome-ignore lint/style/noNonNullAssertion: test fixture — indices are known
  // biome-ignore lint/performance/noDelete: intentional structural removal to test hash verification
  delete stripped[0]!.tool_calls![0]!.args;
  const result = await verify(stripped);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.failures.some((f) => f.reason === "BadHash")).toBe(true);
  }
});
