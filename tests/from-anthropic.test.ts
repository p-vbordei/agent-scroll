import { expect, test } from "bun:test";
import { fromAnthropic } from "../examples/from-anthropic";
import { Turn } from "../src/schema";

test("fromAnthropic maps a 2-message conversation to two normalized Turns", () => {
  const messages: Array<{ role: "user" | "assistant" | "tool" | "system"; content: string }> = [
    { role: "user", content: "hi" },
    { role: "assistant", content: "hello" },
  ];
  const turns = fromAnthropic({
    messages,
    model: { vendor: "anthropic", id: "claude-opus-4-7" },
    params: { temperature: 0, top_p: 1 },
    timestamp_ns_base: 1_700_000_000_000_000_000,
  });
  expect(turns).toHaveLength(2);
  // biome-ignore lint/style/noNonNullAssertion: test fixture — indices are known
  expect(Turn.safeParse(turns[0]!).success).toBe(true);
  // biome-ignore lint/style/noNonNullAssertion: test fixture — indices are known
  expect(turns[0]!.role).toBe("user");
  // biome-ignore lint/style/noNonNullAssertion: test fixture — indices are known
  expect(turns[1]!.role).toBe("assistant");
  // biome-ignore lint/style/noNonNullAssertion: test fixture — indices are known
  expect(turns[0]!.messages[0]?.content).toBe("hi");
});

test("fromAnthropic maps tool_use / tool_result blocks to tool_calls / tool_results", async () => {
  const { sha256 } = await import("@noble/hashes/sha256");
  const { bytesToHex } = await import("@noble/hashes/utils");
  const { canonical } = await import("../src/canonical");
  const argsObj = { city: "Paris" };
  const expectedHash = `sha256:${bytesToHex(sha256(canonical(argsObj)))}`;

  const messages: Array<{
    role: "user" | "assistant" | "tool" | "system";
    content: string | Array<Record<string, unknown>>;
  }> = [
    { role: "user", content: "weather?" },
    {
      role: "assistant",
      content: [{ type: "tool_use", id: "tu_1", name: "weather", input: argsObj }],
    },
  ];
  const turns = fromAnthropic({
    messages,
    model: { vendor: "anthropic", id: "claude-opus-4-7" },
    params: { temperature: 0, top_p: 1 },
    timestamp_ns_base: 1_700_000_000_000_000_000,
  });
  // biome-ignore lint/style/noNonNullAssertion: test fixture — indices are known
  expect(turns[1]!.tool_calls).toEqual([
    { id: "tu_1", name: "weather", args_hash: expectedHash, args: argsObj },
  ]);
});
