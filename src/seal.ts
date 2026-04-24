import * as ed from "@noble/ed25519";
import { canonical, hashCanonical } from "./canonical";
import type { SealedTurn, Turn } from "./schema";

export type SignOpts = { privkey: Uint8Array; pubkey: Uint8Array };

export async function seal(turn: Turn, sign?: SignOpts): Promise<SealedTurn> {
  const hash = hashCanonical(turn);
  if (!sign) return { ...turn, hash };
  const sigBytes = await ed.signAsync(canonical(turn), sign.privkey);
  return {
    ...turn,
    hash,
    sig: {
      alg: "ed25519",
      pubkey: Buffer.from(sign.pubkey).toString("base64"),
      sig: Buffer.from(sigBytes).toString("base64"),
    },
  };
}

export async function sealChain(turns: Turn[], sign?: SignOpts): Promise<SealedTurn[]> {
  const out: SealedTurn[] = [];
  let prev: string | undefined;
  for (const t of turns) {
    const linked: Turn =
      prev !== undefined && t.prev_hash === undefined ? { ...t, prev_hash: prev } : t;
    const sealed = await seal(linked, sign);
    out.push(sealed);
    prev = sealed.hash;
  }
  return out;
}
