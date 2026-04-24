import { hashCanonical } from "./canonical";
import { SealedTurn } from "./schema";
import type { VerifyFailure, VerifyResult } from "./schema";

export async function verify(chain: unknown[]): Promise<VerifyResult> {
  const failures: VerifyFailure[] = [];
  let prevHash: string | undefined;

  for (let i = 0; i < chain.length; i++) {
    const parsed = SealedTurn.safeParse(chain[i]);
    if (!parsed.success) {
      failures.push({ turn: i, reason: "SchemaViolation", detail: parsed.error.message });
      prevHash = undefined;
      continue;
    }
    const sealed = parsed.data;
    const { hash, sig: _sig, ...turnOnly } = sealed;

    if (hashCanonical(turnOnly) !== hash) {
      failures.push({ turn: i, reason: "BadHash" });
      prevHash = hash;
      continue;
    }

    if (i > 0 && turnOnly.prev_hash !== prevHash) {
      failures.push({ turn: i, reason: "BrokenChain" });
    }

    prevHash = hash;
  }

  return failures.length === 0 ? { ok: true } : { ok: false, failures };
}
