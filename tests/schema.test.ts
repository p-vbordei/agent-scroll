import { test, expect } from "bun:test";
import { Turn, SealedTurn } from "../src/schema";

const validTurn = {
  version: "scroll/0.1",
  turn: 0,
  role: "user",
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  params: { temperature: 0, top_p: 1 },
  messages: [{ role: "user", content: "hi" }],
  timestamp_ns: 1_700_000_000_000_000_000,
};

test("Turn parses a minimal valid turn", () => {
  expect(Turn.safeParse(validTurn).success).toBe(true);
});

test("Turn rejects unknown role", () => {
  expect(Turn.safeParse({ ...validTurn, role: "wizard" }).success).toBe(false);
});

test("Turn rejects bad prev_hash format", () => {
  expect(Turn.safeParse({ ...validTurn, prev_hash: "deadbeef" }).success).toBe(false);
});

test("SealedTurn requires a hash field", () => {
  expect(SealedTurn.safeParse(validTurn).success).toBe(false);
  expect(
    SealedTurn.safeParse({
      ...validTurn,
      hash: "sha256:" + "0".repeat(64),
    }).success,
  ).toBe(true);
});
