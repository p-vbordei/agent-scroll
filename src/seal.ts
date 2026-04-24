import { hashCanonical } from "./canonical";
import type { SealedTurn, Turn } from "./schema";

export async function seal(turn: Turn): Promise<SealedTurn> {
  return { ...turn, hash: hashCanonical(turn) };
}
