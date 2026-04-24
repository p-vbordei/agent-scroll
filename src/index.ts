export { canonical, hashCanonical } from "./canonical";
export { seal, sealChain } from "./seal";
export { verify } from "./verify";
export {
  Turn,
  SealedTurn,
  Sig,
  type VerifyFailure,
  type VerifyResult,
} from "./schema";

import { canonical } from "./canonical";
import { SealedTurn, Turn } from "./schema";

export function serialize(value: Turn | SealedTurn): Uint8Array {
  return canonical(value);
}

export function deserialize(bytes: Uint8Array): SealedTurn | Turn {
  const text = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(text);
  const sealed = SealedTurn.safeParse(parsed);
  if (sealed.success) return sealed.data;
  return Turn.parse(parsed); // throws on invalid
}
