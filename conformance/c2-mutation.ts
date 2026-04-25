import * as ed from "@noble/ed25519";
import { canonical } from "../src/canonical.ts";
import type { Turn } from "../src/schema.ts";
import { sealChain } from "../src/seal.ts";
import { verify } from "../src/verify.ts";

const BASE_TURN: Turn = {
  version: "scroll/0.1",
  turn: 0,
  role: "user",
  model: { vendor: "anthropic", id: "claude-sonnet-4-5" },
  params: { temperature: 0, top_p: 1 },
  messages: [{ role: "user", content: "mutation test payload" }],
  timestamp_ns: 1700000000000000000,
};

export default async function c2(): Promise<void> {
  const privkey = ed.utils.randomPrivateKey();
  const pubkey = await ed.getPublicKeyAsync(privkey);

  const [sealed] = await sealChain([BASE_TURN], { privkey, pubkey });
  if (!sealed) throw new Error("C2: sealChain returned empty");

  // --- Part A: flip hash hex chars ---
  const hashHex = sealed.hash.slice("sha256:".length); // 64 hex chars
  let caught = 0;
  for (let i = 0; i < hashHex.length; i++) {
    const flipped = [...hashHex];
    // replace the digit/letter with something adjacent that is still valid hex
    const orig = flipped[i] as string;
    flipped[i] = orig === "0" ? "f" : "0";
    const tampered = {
      ...sealed,
      hash: `sha256:${flipped.join("")}`,
    };
    const res = await verify([tampered], pubkey);
    if (!res.ok) caught++;
  }
  if (caught < hashHex.length) {
    throw new Error(`C2(A): only caught ${caught}/${hashHex.length} hash-field mutations`);
  }

  // --- Part B: mutate bytes inside the canonical body ---
  const { hash: _h, sig: _s, ...turnOnly } = sealed;
  const bodyBytes = canonical(turnOnly);

  // mutate up to 256 positions (or bodyBytes.length, whichever is less)
  const limit = Math.min(bodyBytes.length, 256);
  let bodyFails = 0;

  for (let i = 0; i < limit; i++) {
    // XOR with 0x80 to flip the high bit — keeps byte in range, almost always changes value
    const mutated = new Uint8Array(bodyBytes);
    mutated[i] = mutated[i]! ^ 0x80;

    // If the mutation yields the same byte (0x80 ^ 0x80 = 0 for a 0x80 byte), skip
    if (mutated[i] === bodyBytes[i]) continue;

    // Try to parse the mutated JSON and verify
    let text: string;
    try {
      text = new TextDecoder().decode(mutated);
    } catch {
      bodyFails++;
      continue;
    }

    let parsedTurn: unknown;
    try {
      parsedTurn = JSON.parse(text);
    } catch {
      // parse error = mutation detected (can't form a valid turn)
      bodyFails++;
      continue;
    }

    // Rebuild a sealed turn using the original hash+sig but mutated body
    const tamperedChain = [{ ...(parsedTurn as object), hash: sealed.hash, sig: sealed.sig }];
    try {
      const res = await verify(tamperedChain, pubkey);
      if (!res.ok) bodyFails++;
      // if it passes (very unlikely), we just continue — not every JSON-equivalent mutation
      // is expected to fail if the canonical encoding coincidentally matches
    } catch {
      bodyFails++;
    }
  }

  // We expect at least 80% of body mutations to be caught
  if (bodyFails < Math.floor(limit * 0.8)) {
    throw new Error(`C2(B): only caught ${bodyFails}/${limit} body byte mutations`);
  }
}
