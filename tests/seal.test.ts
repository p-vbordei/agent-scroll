import { expect, test } from "bun:test";
import { hashCanonical } from "../src/canonical";
import type { Turn } from "../src/schema";
import { seal, sealChain } from "../src/seal";

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

test("sealChain() links each turn's prev_hash to the previous hash", async () => {
  const t0: Turn = { ...turn, turn: 0 };
  const t1: Turn = { ...turn, turn: 1, messages: [{ role: "assistant", content: "hello" }] };
  const t2: Turn = { ...turn, turn: 2, messages: [{ role: "user", content: "thanks" }] };

  const chain = await sealChain([t0, t1, t2]);
  expect(chain).toHaveLength(3);
  expect(chain[0]?.prev_hash).toBeUndefined();
  expect(chain[1]?.prev_hash).toBe(chain[0]?.hash);
  expect(chain[2]?.prev_hash).toBe(chain[1]?.hash);
});

test("sealChain() preserves any prev_hash the caller already set on turn 0", async () => {
  const seeded: Turn = { ...turn, turn: 0, prev_hash: `sha256:${"f".repeat(64)}` };
  const [first] = await sealChain([seeded]);
  expect(first?.prev_hash).toBe(`sha256:${"f".repeat(64)}`);
});

import * as ed from "@noble/ed25519";

test("seal() with sign opts attaches an Ed25519 signature", async () => {
  const privkey = ed.utils.randomPrivateKey();
  const pubkey = await ed.getPublicKeyAsync(privkey);
  const sealed = await seal(turn, { privkey, pubkey });
  expect(sealed.sig?.alg).toBe("ed25519");
  expect(sealed.sig?.pubkey).toBe(Buffer.from(pubkey).toString("base64"));
  // Manually verify the signature against canonical(turn-without-hash-sig)
  const { canonical } = await import("../src/canonical");
  const { hash: _h, sig, ...turnOnly } = sealed;
  const ok = await ed.verifyAsync(
    Buffer.from(sig?.sig ?? "", "base64"),
    canonical(turnOnly),
    pubkey,
  );
  expect(ok).toBe(true);
});
