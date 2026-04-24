import { expect, test } from "bun:test";
import { deserialize, seal, serialize } from "../src/index";
import type { Turn } from "../src/index";

const turn: Turn = {
  version: "scroll/0.1",
  turn: 0,
  role: "user",
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  params: { temperature: 0, top_p: 1 },
  messages: [{ role: "user", content: "hi" }],
  timestamp_ns: 1_700_000_000_000_000_000,
};

test("deserialize(serialize(t)) preserves all fields", async () => {
  const sealed = await seal(turn);
  const bytes = serialize(sealed);
  const parsed = deserialize(bytes);
  expect(parsed).toEqual(sealed);
});

test("serialize() returns canonical JCS bytes", async () => {
  const sealed = await seal(turn);
  const bytes = serialize(sealed);
  // Re-canonicalizing the parsed object yields the same bytes.
  const reparsed = deserialize(bytes);
  expect(serialize(reparsed)).toEqual(bytes);
});
