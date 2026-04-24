import { expect, test } from "bun:test";
import { hashCanonical } from "../src/canonical";
import type { Turn } from "../src/schema";
import { seal } from "../src/seal";

const turn: Turn = {
  version: "scroll/0.1",
  turn: 0,
  role: "user",
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  params: { temperature: 0, top_p: 1 },
  messages: [{ role: "user", content: "hi" }],
  timestamp_ns: 1_700_000_000_000_000_000,
};

test("seal() with no sign opts produces a SealedTurn whose hash matches canonical(turn)", async () => {
  const sealed = await seal(turn);
  expect(sealed.hash).toBe(hashCanonical(turn));
  expect(sealed.sig).toBeUndefined();
  // every original field preserved
  expect(sealed.role).toBe("user");
  expect(sealed.messages[0]?.content).toBe("hi");
});

test("seal() is deterministic — same turn yields same hash", async () => {
  const a = await seal(turn);
  const b = await seal(turn);
  expect(a.hash).toBe(b.hash);
});
