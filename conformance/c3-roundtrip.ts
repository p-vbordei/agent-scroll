import * as ed from "@noble/ed25519";
import { canonical } from "../src/canonical";
import { deserialize, serialize } from "../src/index";
import type { Turn } from "../src/schema";
import { sealChain } from "../src/seal";
import turns from "./vectors/c1-turns.json" with { type: "json" };

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

  for (const t of turnsArr) {
    const bytes = serialize(t);
    const recovered = deserialize(bytes);
    if (!canonEqual(t, recovered)) {
      throw new Error(`C3: Turn round-trip failed for turn ${t.turn}`);
    }
  }

  const unsignedSealed = await sealChain(turnsArr.slice(0, 5));
  for (const s of unsignedSealed) {
    const bytes = serialize(s);
    const recovered = deserialize(bytes);
    if (!canonEqual(s, recovered)) {
      throw new Error(`C3: SealedTurn (unsigned) round-trip failed for turn ${s.turn}`);
    }
  }

  const signedSealed = await sealChain(turnsArr.slice(0, 5), { privkey, pubkey });
  for (const s of signedSealed) {
    const bytes = serialize(s);
    const recovered = deserialize(bytes);
    if (!canonEqual(s, recovered)) {
      throw new Error(`C3: SealedTurn (signed) round-trip failed for turn ${s.turn}`);
    }
  }
}
