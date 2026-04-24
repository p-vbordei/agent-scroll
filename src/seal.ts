import { hashCanonical } from "./canonical";
import type { SealedTurn, Turn } from "./schema";

export async function seal(turn: Turn): Promise<SealedTurn> {
  return { ...turn, hash: hashCanonical(turn) };
}

export async function sealChain(turns: Turn[]): Promise<SealedTurn[]> {
  const out: SealedTurn[] = [];
  let prev: string | undefined;
  for (const t of turns) {
    const linked: Turn =
      prev !== undefined && t.prev_hash === undefined ? { ...t, prev_hash: prev } : t;
    const sealed = await seal(linked);
    out.push(sealed);
    prev = sealed.hash;
  }
  return out;
}
