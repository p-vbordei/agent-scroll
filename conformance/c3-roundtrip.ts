import * as ed from "@noble/ed25519";
import { canonical } from "../src/canonical.ts";
import { deserialize, serialize } from "../src/index.ts";
import type { Turn } from "../src/schema.ts";
import { sealChain } from "../src/seal.ts";
import turns from "./vectors/c1-turns.json" with { type: "json" };

// Compare via canonical encoding (JCS sorts keys deterministically)
function canonEqual(a: unknown, b: unknown): boolean {
  const aBytes = canonical(a);
  const bBytes = canonical(b);
  if (aBytes.length !== bBytes.length) return false;
  for (let i = 0; i < aBytes.length; i++) {
    if (aBytes[i] !== bBytes[i]) return false;
  }
  return true;
}

export default async function c3(): Promise<void> {
  const privkey = ed.utils.randomPrivateKey();
  const pubkey = await ed.getPublicKeyAsync(privkey);

  const turnsArr = turns as Turn[];

  // Test Turn round-trip for each of the 20 turns
  for (const t of turnsArr) {
    const bytes = serialize(t);
    const recovered = deserialize(bytes);
    if (!canonEqual(t, recovered)) {
      throw new Error(`C3: Turn round-trip failed for turn ${t.turn}`);
    }
  }

  // Test SealedTurn (unsigned) round-trip
  const unsignedSealed = await sealChain(turnsArr.slice(0, 5));
  for (const s of unsignedSealed) {
    const bytes = serialize(s);
    const recovered = deserialize(bytes);
    if (!canonEqual(s, recovered)) {
      throw new Error(`C3: SealedTurn (unsigned) round-trip failed for turn ${s.turn}`);
    }
  }

  // Test SealedTurn (signed) round-trip
  const signedSealed = await sealChain(turnsArr.slice(0, 5), { privkey, pubkey });
  for (const s of signedSealed) {
    const bytes = serialize(s);
    const recovered = deserialize(bytes);
    if (!canonEqual(s, recovered)) {
      throw new Error(`C3: SealedTurn (signed) round-trip failed for turn ${s.turn}`);
    }
  }
}
