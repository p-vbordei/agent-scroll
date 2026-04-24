# agent-scroll v0.1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v0.1.0 of agent-scroll — a canonical, byte-deterministic, hash-chained, optionally Ed25519-signed serialization of an AI-agent conversation — with conformance vectors and a one-command demo.

**Architecture:** Pure Bun + TypeScript library. Public surface is four functions (`serialize`, `deserialize`, `seal`, `verify`) plus a `scroll` CLI. JCS canonicalization via the `canonicalize` package; SHA-256 + Ed25519 via `@noble/*`; runtime schema via Zod. Anthropic→Turn mapping is a single recipe in `examples/`, NOT an abstraction. Conformance vectors live in `conformance/vectors/` with single-byte mutation pairs and a runner that re-validates the implementation against them.

**Tech Stack:** Bun (runtime + test runner + bundler), TypeScript (strict), Zod, `canonicalize`, `@noble/ed25519`, `@noble/hashes`, Biome (lint + format).

---

## File map (locked in before tasks)

```
src/
├── schema.ts        # Zod: Turn, SealedTurn, Sig + types + VerifyResult
├── canonical.ts     # canonical(value) -> Uint8Array; hashCanonical -> "sha256:..."
├── seal.ts          # seal(turn, sign?), sealChain(turns, sign?)
├── verify.ts        # verify(chain, pubkey?) -> VerifyResult
├── cli.ts           # scroll canon | seal | verify
└── index.ts         # public re-exports

examples/
├── from-anthropic.ts   # fromAnthropic(...) -> Turn[]
├── conversation.json   # small 3-turn Anthropic-shaped sample
└── demo.ts             # 20-line end-to-end demo

conformance/
├── README.md
├── runner.ts        # loads vectors, exercises serialize/seal/verify
└── vectors/
    ├── 001-…json    # ≥20 base SealedTurn vectors
    └── mutations/   # single-byte tampered pairs

tests/
├── canonical.test.ts
├── schema.test.ts
├── seal.test.ts
├── verify.test.ts
├── from-anthropic.test.ts
├── security.test.ts
└── conformance.test.ts

root: package.json, tsconfig.json, biome.json, .github/workflows/ci.yml
```

Each src file is a single responsibility, all comfortably under 200 lines.

---

## Stage 2.1 — Smallest vertical slice (unsigned chain, end-to-end)

**Sub-stage goal:** Prove the design end-to-end with NO signing, NO vendor mapping, NO CLI. By the end, a hardcoded 2-turn unsigned chain seals + verifies, and a single-byte mutation is detected.

**Verification:** `bun test tests/canonical.test.ts tests/schema.test.ts tests/seal.test.ts tests/verify.test.ts tests/integration.test.ts` is green.

---

### Task 2.1.1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `biome.json`
- Modify: `.gitignore`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "agent-scroll",
  "version": "0.1.0",
  "type": "module",
  "description": "Canonical byte-deterministic transcript format for AI-agent conversations",
  "license": "Apache-2.0",
  "bin": { "scroll": "./dist/scroll" },
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "bun test",
    "lint": "biome check src tests examples conformance",
    "format": "biome format --write src tests examples conformance",
    "build": "bun build src/cli.ts --compile --outfile dist/scroll",
    "demo": "bun run examples/demo.ts",
    "conformance": "bun run conformance/runner.ts"
  },
  "dependencies": {
    "@noble/ed25519": "^2.1.0",
    "@noble/hashes": "^1.5.0",
    "canonicalize": "^2.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "@types/bun": "latest",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": ["bun-types"]
  },
  "include": ["src", "tests", "examples", "conformance"]
}
```

- [ ] **Step 3: Write `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "organizeImports": { "enabled": true }
}
```

- [ ] **Step 4: Append to `.gitignore`**

Append (do not overwrite):

```
node_modules/
dist/
bun.lock
*.log
.DS_Store
```

- [ ] **Step 5: Install dependencies**

Run: `bun install`
Expected: `bun.lock` created, `node_modules/` populated, no errors.

- [ ] **Step 6: Smoke-test the toolchain**

Run: `bun --version && bun test --help >/dev/null && echo OK`
Expected: Bun version printed and `OK`.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json biome.json .gitignore bun.lock
git commit -m "chore: project scaffold (Bun + TS + Zod + Biome)"
```

---

### Task 2.1.2: Zod schema for `Turn` and `SealedTurn` (unsigned variant)

**Files:**
- Create: `src/schema.ts`
- Test: `tests/schema.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/schema.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/schema.test.ts`
Expected: FAIL with "cannot find module '../src/schema'".

- [ ] **Step 3: Write minimal implementation**

`src/schema.ts`:

```ts
import { z } from "zod";

const HashStr = z.string().regex(/^sha256:[0-9a-f]{64}$/);

const Model = z.object({
  vendor: z.string().min(1),
  id: z.string().min(1),
  fingerprint: z.string().optional(),
});

const Params = z.object({
  temperature: z.number(),
  top_p: z.number(),
  seed: z.number().int().optional(),
  max_tokens: z.number().int().optional(),
});

const Message = z.object({
  role: z.string(),
  content: z.union([z.string(), z.array(z.unknown())]),
});

const ToolCall = z.object({
  id: z.string(),
  name: z.string(),
  args_hash: HashStr,
  args: z.unknown().optional(),
});

const ToolResult = z.object({
  id: z.string(),
  status: z.enum(["ok", "error"]),
  response_hash: HashStr,
  response: z.unknown().optional(),
});

export const Turn = z.object({
  version: z.literal("scroll/0.1"),
  turn: z.number().int().nonnegative(),
  role: z.enum(["user", "assistant", "tool", "system"]),
  model: Model,
  params: Params,
  messages: z.array(Message),
  tool_calls: z.array(ToolCall).optional(),
  tool_results: z.array(ToolResult).optional(),
  timestamp_ns: z.number().int().nonnegative(),
  prev_hash: HashStr.optional(),
});
export type Turn = z.infer<typeof Turn>;

export const Sig = z.object({
  alg: z.literal("ed25519"),
  pubkey: z.string(),
  sig: z.string(),
});
export type Sig = z.infer<typeof Sig>;

export const SealedTurn = Turn.extend({
  hash: HashStr,
  sig: Sig.optional(),
});
export type SealedTurn = z.infer<typeof SealedTurn>;

export type VerifyFailure =
  | { turn: number; reason: "BadHash" }
  | { turn: number; reason: "BrokenChain" }
  | { turn: number; reason: "BadSignature" }
  | { turn: number; reason: "SchemaViolation"; detail: string };

export type VerifyResult =
  | { ok: true }
  | { ok: false; failures: VerifyFailure[] };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/schema.test.ts`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/schema.ts tests/schema.test.ts
git commit -m "feat(schema): Zod schemas for Turn, SealedTurn, Sig"
```

---

### Task 2.1.3: `canonical()` and `hashCanonical()`

**Files:**
- Create: `src/canonical.ts`
- Test: `tests/canonical.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/canonical.test.ts`:

```ts
import { test, expect } from "bun:test";
import { canonical, hashCanonical } from "../src/canonical";

test("canonical is byte-identical regardless of key order", () => {
  const a = canonical({ b: 1, a: 2 });
  const b = canonical({ a: 2, b: 1 });
  expect(a).toEqual(b);
  expect(new TextDecoder().decode(a)).toBe('{"a":2,"b":1}');
});

test("canonical sorts nested keys deterministically", () => {
  const s = new TextDecoder().decode(canonical({ z: { y: 1, x: 2 }, a: 0 }));
  expect(s).toBe('{"a":0,"z":{"x":2,"y":1}}');
});

test("hashCanonical returns 'sha256:' + 64 hex chars", () => {
  const h = hashCanonical({ hello: "world" });
  expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
});

test("hashCanonical of {a:1,b:2} equals known JCS hash", () => {
  // canonical = '{"a":1,"b":2}' = bytes 7b2261223a312c2262223a327d
  // sha256 of those 13 bytes = 43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777
  expect(hashCanonical({ b: 2, a: 1 })).toBe(
    "sha256:43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777",
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/canonical.test.ts`
Expected: FAIL with "cannot find module '../src/canonical'".

- [ ] **Step 3: Write implementation**

`src/canonical.ts`:

```ts
import canonicalize from "canonicalize";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

export function canonical(value: unknown): Uint8Array {
  const s = canonicalize(value);
  if (s === undefined) throw new Error("canonicalize: value not representable");
  return new TextEncoder().encode(s);
}

export function hashCanonical(value: unknown): string {
  return "sha256:" + bytesToHex(sha256(canonical(value)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/canonical.test.ts`
Expected: 4 PASS.

If the known-hash assertion fails, recompute it from the wire bytes (`echo -n '{"a":1,"b":2}' | shasum -a 256`) and update the test, NOT the implementation.

- [ ] **Step 5: Commit**

```bash
git add src/canonical.ts tests/canonical.test.ts
git commit -m "feat(canonical): JCS canonical() and hashCanonical()"
```

---

### Task 2.1.4: `seal()` — unsigned single turn

**Files:**
- Create: `src/seal.ts`
- Test: `tests/seal.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/seal.test.ts`:

```ts
import { test, expect } from "bun:test";
import { seal } from "../src/seal";
import { hashCanonical } from "../src/canonical";
import type { Turn } from "../src/schema";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/seal.test.ts`
Expected: FAIL with "cannot find module '../src/seal'".

- [ ] **Step 3: Write implementation (unsigned only — sign param added in Stage 2.2)**

`src/seal.ts`:

```ts
import { hashCanonical } from "./canonical";
import type { Turn, SealedTurn } from "./schema";

export async function seal(turn: Turn): Promise<SealedTurn> {
  return { ...turn, hash: hashCanonical(turn) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/seal.test.ts`
Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/seal.ts tests/seal.test.ts
git commit -m "feat(seal): unsigned single-turn seal()"
```

---

### Task 2.1.5: `sealChain()` — multi-turn unsigned chain

**Files:**
- Modify: `src/seal.ts`
- Modify: `tests/seal.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `tests/seal.test.ts`:

```ts
import { sealChain } from "../src/seal";

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
  const seeded: Turn = { ...turn, turn: 0, prev_hash: "sha256:" + "f".repeat(64) };
  const [first] = await sealChain([seeded]);
  expect(first?.prev_hash).toBe("sha256:" + "f".repeat(64));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/seal.test.ts`
Expected: FAIL with "sealChain not exported".

- [ ] **Step 3: Implement `sealChain`**

Add to `src/seal.ts`:

```ts
export async function sealChain(turns: Turn[]): Promise<SealedTurn[]> {
  const out: SealedTurn[] = [];
  let prev: string | undefined;
  for (const t of turns) {
    const linked: Turn = prev !== undefined && t.prev_hash === undefined
      ? { ...t, prev_hash: prev }
      : t;
    const sealed = await seal(linked);
    out.push(sealed);
    prev = sealed.hash;
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/seal.test.ts`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/seal.ts tests/seal.test.ts
git commit -m "feat(seal): sealChain() links prev_hash across turns"
```

---

### Task 2.1.6: `verify()` — unsigned (BadHash, BrokenChain, SchemaViolation)

**Files:**
- Create: `src/verify.ts`
- Test: `tests/verify.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/verify.test.ts`:

```ts
import { test, expect } from "bun:test";
import { verify } from "../src/verify";
import { sealChain } from "../src/seal";
import type { Turn } from "../src/schema";

const t = (n: number, content: string): Turn => ({
  version: "scroll/0.1",
  turn: n,
  role: n % 2 === 0 ? "user" : "assistant",
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  params: { temperature: 0, top_p: 1 },
  messages: [{ role: n % 2 === 0 ? "user" : "assistant", content }],
  timestamp_ns: 1_700_000_000_000_000_000 + n,
});

test("verify() returns ok for a freshly sealed chain", async () => {
  const chain = await sealChain([t(0, "hi"), t(1, "hello"), t(2, "thanks")]);
  expect(await verify(chain)).toEqual({ ok: true });
});

test("verify() flags BadHash when a turn body is mutated", async () => {
  const chain = await sealChain([t(0, "hi"), t(1, "hello")]);
  const mutated = structuredClone(chain);
  mutated[1]!.messages[0]!.content = "GOTCHA";
  const result = await verify(mutated);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.failures.some((f) => f.turn === 1 && f.reason === "BadHash")).toBe(true);
  }
});

test("verify() flags BrokenChain when prev_hash is rewritten", async () => {
  const chain = await sealChain([t(0, "hi"), t(1, "hello")]);
  const mutated = structuredClone(chain);
  mutated[1]!.prev_hash = "sha256:" + "0".repeat(64);
  // recompute hash so BadHash doesn't trip first
  const { hash: _omit, sig: _omit2, ...turnOnly } = mutated[1]!;
  const { hashCanonical } = await import("../src/canonical");
  mutated[1]!.hash = hashCanonical(turnOnly);
  const result = await verify(mutated);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.failures.some((f) => f.turn === 1 && f.reason === "BrokenChain")).toBe(true);
  }
});

test("verify() flags SchemaViolation on garbage input", async () => {
  const result = await verify([{ not: "a turn" }]);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.failures[0]?.reason).toBe("SchemaViolation");
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/verify.test.ts`
Expected: FAIL with "cannot find module '../src/verify'".

- [ ] **Step 3: Implement `verify` (unsigned-only path; signature path lands in 2.2.2)**

`src/verify.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/verify.test.ts`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/verify.ts tests/verify.test.ts
git commit -m "feat(verify): unsigned chain verify with BadHash / BrokenChain / SchemaViolation"
```

---

### Task 2.1.7: `src/index.ts` re-exports

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Write the public API barrel**

`src/index.ts`:

```ts
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
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat(index): public API barrel"
```

---

### Task 2.1.8: Vertical-slice integration test

**Files:**
- Create: `tests/integration.test.ts`

- [ ] **Step 1: Write the integration test**

`tests/integration.test.ts`:

```ts
import { test, expect } from "bun:test";
import { sealChain, verify } from "../src/index";
import type { Turn } from "../src/index";

const baseTurn = (n: number, content: string): Turn => ({
  version: "scroll/0.1",
  turn: n,
  role: n % 2 === 0 ? "user" : "assistant",
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  params: { temperature: 0, top_p: 1 },
  messages: [{ role: n % 2 === 0 ? "user" : "assistant", content }],
  timestamp_ns: 1_700_000_000_000_000_000 + n,
});

test("vertical slice: seal a 3-turn chain and verify round-trip", async () => {
  const chain = await sealChain([
    baseTurn(0, "what's the weather"),
    baseTurn(1, "sunny, 72F"),
    baseTurn(2, "thanks"),
  ]);
  expect(await verify(chain)).toEqual({ ok: true });
});

test("vertical slice: any single-byte mutation in any turn is detected", async () => {
  const chain = await sealChain([baseTurn(0, "a"), baseTurn(1, "b")]);
  const mutated = structuredClone(chain);
  mutated[0]!.messages[0]!.content = "A"; // single character flip
  const result = await verify(mutated);
  expect(result.ok).toBe(false);
});

test("vertical slice: byte-determinism — two independent seals produce identical chains", async () => {
  const turns = [baseTurn(0, "x"), baseTurn(1, "y")];
  const a = await sealChain(turns);
  const b = await sealChain(turns);
  expect(a.map((t) => t.hash)).toEqual(b.map((t) => t.hash));
});
```

- [ ] **Step 2: Run test**

Run: `bun test tests/integration.test.ts`
Expected: 3 PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration.test.ts
git commit -m "test(integration): unsigned-chain vertical slice"
```

---

### Task 2.1.9: Stage 2.1 close-out — full test run

- [ ] **Step 1: Run all tests**

Run: `bun test`
Expected: every test passes; no skipped tests.

- [ ] **Step 2: Run formatter + linter**

Run: `bun run lint`
Expected: no warnings or errors.

- [ ] **Step 3: Confirm `git status` is clean**

Run: `git status`
Expected: "nothing to commit, working tree clean".

- [ ] **Step 4: Tag the slice (lightweight, local-only)**

```bash
git tag stage-2.1-vertical-slice
```

---

## Stage 2.2 — Remaining IN-V0.1 features (signing, deserialize, CLI, Anthropic recipe, redaction)

**Sub-stage goal:** Layer Ed25519 signing onto seal/verify, expose `serialize`/`deserialize`, ship the `scroll` CLI, write the Anthropic-Messages recipe, and prove hash-only redaction works.

**Verification:** `bun test` is fully green; `echo '...turn json...' | bun run src/cli.ts canon` emits canonical bytes; `bun run examples/from-anthropic.ts < examples/conversation.json` prints normalized turns.

---

### Task 2.2.1: Add Ed25519 signing to `seal()`

**Files:**
- Modify: `src/seal.ts`
- Modify: `tests/seal.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `tests/seal.test.ts`:

```ts
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
    Buffer.from(sig!.sig, "base64"),
    canonical(turnOnly),
    pubkey,
  );
  expect(ok).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/seal.test.ts`
Expected: FAIL — `seal` does not accept a second argument.

- [ ] **Step 3: Extend `seal()` signature**

Replace `src/seal.ts` with:

```ts
import * as ed from "@noble/ed25519";
import { canonical, hashCanonical } from "./canonical";
import type { Turn, SealedTurn } from "./schema";

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
    const linked: Turn = prev !== undefined && t.prev_hash === undefined
      ? { ...t, prev_hash: prev }
      : t;
    const sealed = await seal(linked, sign);
    out.push(sealed);
    prev = sealed.hash;
  }
  return out;
}
```

- [ ] **Step 4: Run all seal tests**

Run: `bun test tests/seal.test.ts`
Expected: all PASS (5 total).

- [ ] **Step 5: Commit**

```bash
git add src/seal.ts tests/seal.test.ts
git commit -m "feat(seal): optional Ed25519 signing"
```

---

### Task 2.2.2: Add Ed25519 verification to `verify()`

**Files:**
- Modify: `src/verify.ts`
- Modify: `tests/verify.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `tests/verify.test.ts`:

```ts
import * as ed from "@noble/ed25519";

test("verify(chain, pubkey) returns ok for a signed chain", async () => {
  const privkey = ed.utils.randomPrivateKey();
  const pubkey = await ed.getPublicKeyAsync(privkey);
  const chain = await sealChain([t(0, "hi"), t(1, "hello")], { privkey, pubkey });
  expect(await verify(chain, pubkey)).toEqual({ ok: true });
});

test("verify(chain, pubkey) flags BadSignature on signature byte flip", async () => {
  const privkey = ed.utils.randomPrivateKey();
  const pubkey = await ed.getPublicKeyAsync(privkey);
  const chain = await sealChain([t(0, "hi")], { privkey, pubkey });
  const mutated = structuredClone(chain);
  // flip first base64 char (decode → flip → re-encode)
  const sigBytes = Buffer.from(mutated[0]!.sig!.sig, "base64");
  sigBytes[0] = sigBytes[0]! ^ 0x01;
  mutated[0]!.sig!.sig = sigBytes.toString("base64");
  const result = await verify(mutated, pubkey);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.failures.some((f) => f.reason === "BadSignature")).toBe(true);
  }
});

test("verify(chain) without pubkey ignores signatures", async () => {
  const privkey = ed.utils.randomPrivateKey();
  const pubkey = await ed.getPublicKeyAsync(privkey);
  const chain = await sealChain([t(0, "hi")], { privkey, pubkey });
  // No pubkey passed → signature not checked → still ok if hash chain holds.
  expect(await verify(chain)).toEqual({ ok: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/verify.test.ts`
Expected: FAIL — `verify` doesn't accept `pubkey`.

- [ ] **Step 3: Extend `verify()` to support signatures**

Replace `src/verify.ts` with:

```ts
import * as ed from "@noble/ed25519";
import { canonical, hashCanonical } from "./canonical";
import { SealedTurn } from "./schema";
import type { VerifyFailure, VerifyResult } from "./schema";

export async function verify(chain: unknown[], pubkey?: Uint8Array): Promise<VerifyResult> {
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
    const { hash, sig, ...turnOnly } = sealed;

    if (hashCanonical(turnOnly) !== hash) {
      failures.push({ turn: i, reason: "BadHash" });
      prevHash = hash;
      continue;
    }

    if (i > 0 && turnOnly.prev_hash !== prevHash) {
      failures.push({ turn: i, reason: "BrokenChain" });
    }

    if (sig && pubkey) {
      const sigBytes = Buffer.from(sig.sig, "base64");
      const ok = await ed.verifyAsync(sigBytes, canonical(turnOnly), pubkey);
      if (!ok) failures.push({ turn: i, reason: "BadSignature" });
    }

    prevHash = hash;
  }

  return failures.length === 0 ? { ok: true } : { ok: false, failures };
}
```

- [ ] **Step 4: Run all verify tests**

Run: `bun test tests/verify.test.ts`
Expected: all PASS (7 total).

- [ ] **Step 5: Commit**

```bash
git add src/verify.ts tests/verify.test.ts
git commit -m "feat(verify): Ed25519 signature verification"
```

---

### Task 2.2.3: `serialize()` and `deserialize()` round-trip

**Files:**
- Modify: `src/index.ts`
- Create: `tests/roundtrip.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/roundtrip.test.ts`:

```ts
import { test, expect } from "bun:test";
import { serialize, deserialize, seal } from "../src/index";
import type { Turn } from "../src/index";

const turn: Turn = {
  version: "scroll/0.1",
  turn: 0,
  role: "user",
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  params: { temperature: 0, top_p: 1 },
  messages: [{ role: "user", content: "hi" }],
  timestamp_ns: 1_700_000_000_000_000_000,
};

test("deserialize(serialize(t)) preserves all fields", async () => {
  const sealed = await seal(turn);
  const bytes = serialize(sealed);
  const parsed = deserialize(bytes);
  expect(parsed).toEqual(sealed);
});

test("serialize() returns canonical JCS bytes", async () => {
  const sealed = await seal(turn);
  const bytes = serialize(sealed);
  // Re-canonicalizing the parsed object yields the same bytes.
  const reparsed = deserialize(bytes);
  expect(serialize(reparsed)).toEqual(bytes);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/roundtrip.test.ts`
Expected: FAIL — `serialize`/`deserialize` not exported.

- [ ] **Step 3: Add `serialize()` and `deserialize()` to the public API**

Append to `src/index.ts`:

```ts
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
```

- [ ] **Step 4: Run test**

Run: `bun test tests/roundtrip.test.ts`
Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/roundtrip.test.ts
git commit -m "feat(index): serialize() and deserialize() round-trip"
```

---

### Task 2.2.4: CLI — `scroll canon`

**Files:**
- Create: `src/cli.ts`
- Create: `tests/cli.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/cli.test.ts`:

```ts
import { test, expect } from "bun:test";

const cli = "src/cli.ts";

async function run(args: string[], stdin?: string): Promise<{ stdout: string; stderr: string; code: number }> {
  const proc = Bun.spawn(["bun", "run", cli, ...args], {
    stdin: stdin !== undefined ? new TextEncoder().encode(stdin) : undefined,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const code = await proc.exited;
  return { stdout, stderr, code };
}

test("scroll canon emits JCS bytes for stdin JSON", async () => {
  const r = await run(["canon"], '{"b":1,"a":2}');
  expect(r.code).toBe(0);
  expect(r.stdout).toBe('{"a":2,"b":1}');
});

test("scroll (no args) prints usage and exits 1", async () => {
  const r = await run([]);
  expect(r.code).toBe(1);
  expect(r.stderr).toContain("usage:");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/cli.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement CLI skeleton with `canon`**

`src/cli.ts`:

```ts
#!/usr/bin/env bun
import { canonical } from "./canonical";

const USAGE = `usage: scroll <canon | seal | verify> [flags]

  canon              read JSON on stdin, write canonical (JCS) bytes to stdout
  seal --key <hex>   read Turn[] JSON on stdin, write SealedTurn[] JSON to stdout
  verify [--pubkey <hex>]
                     read SealedTurn[] JSON on stdin, exit 0 if valid else 1
`;

async function main(): Promise<number> {
  const [cmd, ...rest] = Bun.argv.slice(2);
  switch (cmd) {
    case "canon":
      return canonCmd();
    case "seal":
      return await sealCmd(rest);
    case "verify":
      return await verifyCmd(rest);
    default:
      process.stderr.write(USAGE);
      return 1;
  }
}

async function canonCmd(): Promise<number> {
  const text = await Bun.stdin.text();
  const value = JSON.parse(text);
  process.stdout.write(canonical(value));
  return 0;
}

async function sealCmd(_args: string[]): Promise<number> {
  process.stderr.write("seal: not implemented yet\n");
  return 1;
}

async function verifyCmd(_args: string[]): Promise<number> {
  process.stderr.write("verify: not implemented yet\n");
  return 1;
}

process.exit(await main());
```

- [ ] **Step 4: Run test**

Run: `bun test tests/cli.test.ts`
Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts tests/cli.test.ts
git commit -m "feat(cli): scroll canon subcommand"
```

---

### Task 2.2.5: CLI — `scroll seal`

**Files:**
- Modify: `src/cli.ts`
- Modify: `tests/cli.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `tests/cli.test.ts`:

```ts
test("scroll seal --key <hex> seals an unsealed Turn[] from stdin", async () => {
  const turn = {
    version: "scroll/0.1",
    turn: 0,
    role: "user",
    model: { vendor: "anthropic", id: "claude-opus-4-7" },
    params: { temperature: 0, top_p: 1 },
    messages: [{ role: "user", content: "hi" }],
    timestamp_ns: 1_700_000_000_000_000_000,
  };
  const key = "00".repeat(32); // deterministic test key
  const r = await run(["seal", "--key", key], JSON.stringify([turn]));
  expect(r.code).toBe(0);
  const parsed = JSON.parse(r.stdout);
  expect(parsed).toHaveLength(1);
  expect(parsed[0]).toHaveProperty("hash");
  expect(parsed[0]).toHaveProperty("sig.alg", "ed25519");
});

test("scroll seal (no key) emits unsigned SealedTurn[]", async () => {
  const turn = {
    version: "scroll/0.1",
    turn: 0,
    role: "user",
    model: { vendor: "anthropic", id: "claude-opus-4-7" },
    params: { temperature: 0, top_p: 1 },
    messages: [{ role: "user", content: "hi" }],
    timestamp_ns: 1_700_000_000_000_000_000,
  };
  const r = await run(["seal"], JSON.stringify([turn]));
  expect(r.code).toBe(0);
  const parsed = JSON.parse(r.stdout);
  expect(parsed[0]).toHaveProperty("hash");
  expect(parsed[0].sig).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/cli.test.ts`
Expected: FAIL — `seal` not implemented.

- [ ] **Step 3: Implement `sealCmd`**

Replace the placeholder `sealCmd` in `src/cli.ts`:

```ts
import * as ed from "@noble/ed25519";
import { sealChain } from "./seal";
import { Turn } from "./schema";
import { z } from "zod";

async function sealCmd(args: string[]): Promise<number> {
  const keyHex = flag(args, "--key");
  const text = await Bun.stdin.text();
  const turns = z.array(Turn).parse(JSON.parse(text));
  let sign: { privkey: Uint8Array; pubkey: Uint8Array } | undefined;
  if (keyHex) {
    const privkey = hexToBytes(keyHex);
    const pubkey = await ed.getPublicKeyAsync(privkey);
    sign = { privkey, pubkey };
  }
  const chain = await sealChain(turns, sign);
  process.stdout.write(JSON.stringify(chain));
  return 0;
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("hex string must have even length");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
```

- [ ] **Step 4: Run test**

Run: `bun test tests/cli.test.ts`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts tests/cli.test.ts
git commit -m "feat(cli): scroll seal subcommand with optional --key"
```

---

### Task 2.2.6: CLI — `scroll verify`

**Files:**
- Modify: `src/cli.ts`
- Modify: `tests/cli.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `tests/cli.test.ts`:

```ts
test("scroll verify exits 0 on a valid sealed chain", async () => {
  const turn = {
    version: "scroll/0.1",
    turn: 0,
    role: "user",
    model: { vendor: "anthropic", id: "claude-opus-4-7" },
    params: { temperature: 0, top_p: 1 },
    messages: [{ role: "user", content: "hi" }],
    timestamp_ns: 1_700_000_000_000_000_000,
  };
  const sealed = await run(["seal"], JSON.stringify([turn]));
  const v = await run(["verify"], sealed.stdout);
  expect(v.code).toBe(0);
});

test("scroll verify exits 1 and prints failures on a tampered chain", async () => {
  const turn = {
    version: "scroll/0.1",
    turn: 0,
    role: "user",
    model: { vendor: "anthropic", id: "claude-opus-4-7" },
    params: { temperature: 0, top_p: 1 },
    messages: [{ role: "user", content: "hi" }],
    timestamp_ns: 1_700_000_000_000_000_000,
  };
  const sealed = await run(["seal"], JSON.stringify([turn]));
  const tampered = sealed.stdout.replace(`"hi"`, `"HI"`);
  const v = await run(["verify"], tampered);
  expect(v.code).toBe(1);
  expect(v.stderr).toContain("BadHash");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/cli.test.ts`
Expected: FAIL — `verify` not implemented.

- [ ] **Step 3: Implement `verifyCmd`**

Replace the placeholder `verifyCmd` in `src/cli.ts`:

```ts
import { verify } from "./verify";

async function verifyCmd(args: string[]): Promise<number> {
  const pubkeyHex = flag(args, "--pubkey");
  const text = await Bun.stdin.text();
  const chain = JSON.parse(text);
  const pubkey = pubkeyHex ? hexToBytes(pubkeyHex) : undefined;
  const result = await verify(chain, pubkey);
  if (result.ok) {
    process.stdout.write("ok\n");
    return 0;
  }
  for (const f of result.failures) {
    process.stderr.write(
      `turn ${f.turn}: ${f.reason}${"detail" in f ? ` (${f.detail})` : ""}\n`,
    );
  }
  return 1;
}
```

- [ ] **Step 4: Run test**

Run: `bun test tests/cli.test.ts`
Expected: 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts tests/cli.test.ts
git commit -m "feat(cli): scroll verify subcommand with optional --pubkey"
```

---

### Task 2.2.7: `examples/from-anthropic.ts` — vendor recipe

**Files:**
- Create: `examples/from-anthropic.ts`
- Test: `tests/from-anthropic.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/from-anthropic.test.ts`:

```ts
import { test, expect } from "bun:test";
import { fromAnthropic } from "../examples/from-anthropic";
import { Turn } from "../src/schema";

test("fromAnthropic maps a 2-message conversation to two normalized Turns", () => {
  const messages = [
    { role: "user", content: "hi" },
    { role: "assistant", content: "hello" },
  ];
  const turns = fromAnthropic({
    messages,
    model: { vendor: "anthropic", id: "claude-opus-4-7" },
    params: { temperature: 0, top_p: 1 },
    timestamp_ns_base: 1_700_000_000_000_000_000,
  });
  expect(turns).toHaveLength(2);
  expect(Turn.safeParse(turns[0]).success).toBe(true);
  expect(turns[0].role).toBe("user");
  expect(turns[1].role).toBe("assistant");
  expect(turns[0].messages[0]?.content).toBe("hi");
});

test("fromAnthropic maps tool_use / tool_result blocks to tool_calls / tool_results", async () => {
  const { sha256 } = await import("@noble/hashes/sha256");
  const { bytesToHex } = await import("@noble/hashes/utils");
  const { canonical } = await import("../src/canonical");
  const argsObj = { city: "Paris" };
  const expectedHash = "sha256:" + bytesToHex(sha256(canonical(argsObj)));

  const messages = [
    { role: "user", content: "weather?" },
    {
      role: "assistant",
      content: [
        { type: "tool_use", id: "tu_1", name: "weather", input: argsObj },
      ],
    },
  ];
  const turns = fromAnthropic({
    messages,
    model: { vendor: "anthropic", id: "claude-opus-4-7" },
    params: { temperature: 0, top_p: 1 },
    timestamp_ns_base: 1_700_000_000_000_000_000,
  });
  expect(turns[1].tool_calls).toEqual([
    { id: "tu_1", name: "weather", args_hash: expectedHash, args: argsObj },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/from-anthropic.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the recipe**

`examples/from-anthropic.ts`:

```ts
import { hashCanonical } from "../src/canonical";
import type { Turn } from "../src/schema";

type AnthropicMessage = {
  role: "user" | "assistant" | "tool" | "system";
  content: string | Array<Record<string, unknown>>;
};

type Args = {
  messages: AnthropicMessage[];
  model: { vendor: string; id: string; fingerprint?: string };
  params: { temperature: number; top_p: number; seed?: number; max_tokens?: number };
  timestamp_ns_base: number;
};

export function fromAnthropic({ messages, model, params, timestamp_ns_base }: Args): Turn[] {
  return messages.map((m, i) => {
    const turn: Turn = {
      version: "scroll/0.1",
      turn: i,
      role: m.role,
      model,
      params,
      messages: [{ role: m.role, content: m.content }],
      timestamp_ns: timestamp_ns_base + i,
    };
    if (Array.isArray(m.content)) {
      const tool_calls = m.content
        .filter((b) => b.type === "tool_use")
        .map((b) => ({
          id: String(b.id),
          name: String(b.name),
          args_hash: hashCanonical(b.input),
          args: b.input,
        }));
      const tool_results = m.content
        .filter((b) => b.type === "tool_result")
        .map((b) => ({
          id: String(b.tool_use_id ?? b.id),
          status: (b.is_error ? "error" : "ok") as "ok" | "error",
          response_hash: hashCanonical(b.content),
          response: b.content,
        }));
      if (tool_calls.length) turn.tool_calls = tool_calls;
      if (tool_results.length) turn.tool_results = tool_results;
    }
    return turn;
  });
}
```

- [ ] **Step 4: Run test**

Run: `bun test tests/from-anthropic.test.ts`
Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add examples/from-anthropic.ts tests/from-anthropic.test.ts
git commit -m "feat(examples): fromAnthropic Messages → Turn[] recipe"
```

---

### Task 2.2.8: Hash-only redaction acceptance test

**Files:**
- Create: `tests/redaction.test.ts`

- [ ] **Step 1: Write the test**

`tests/redaction.test.ts`:

```ts
import { test, expect } from "bun:test";
import { sealChain, verify, hashCanonical } from "../src/index";
import type { Turn } from "../src/index";

const argsObj = { ssn: "123-45-6789" };

test("a turn that omits args plaintext (hash-only) seals and verifies", async () => {
  const t: Turn = {
    version: "scroll/0.1",
    turn: 0,
    role: "assistant",
    model: { vendor: "anthropic", id: "claude-opus-4-7" },
    params: { temperature: 0, top_p: 1 },
    messages: [{ role: "assistant", content: "checking" }],
    tool_calls: [
      {
        id: "tu_1",
        name: "lookup",
        args_hash: hashCanonical(argsObj),
        // args INTENTIONALLY omitted — PII redacted
      },
    ],
    timestamp_ns: 1_700_000_000_000_000_000,
  };
  const chain = await sealChain([t]);
  expect(await verify(chain)).toEqual({ ok: true });
});

test("stripping args after sealing breaks the chain (intended)", async () => {
  const t: Turn = {
    version: "scroll/0.1",
    turn: 0,
    role: "assistant",
    model: { vendor: "anthropic", id: "claude-opus-4-7" },
    params: { temperature: 0, top_p: 1 },
    messages: [{ role: "assistant", content: "checking" }],
    tool_calls: [
      { id: "tu_1", name: "lookup", args_hash: hashCanonical(argsObj), args: argsObj },
    ],
    timestamp_ns: 1_700_000_000_000_000_000,
  };
  const chain = await sealChain([t]);
  const stripped = structuredClone(chain);
  delete stripped[0]!.tool_calls![0]!.args;
  const result = await verify(stripped);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.failures.some((f) => f.reason === "BadHash")).toBe(true);
  }
});
```

- [ ] **Step 2: Run test**

Run: `bun test tests/redaction.test.ts`
Expected: 2 PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/redaction.test.ts
git commit -m "test(redaction): hash-only seals; post-hoc strip is detected"
```

---

### Task 2.2.9: Stage 2.2 close-out

- [ ] **Step 1: Run all tests**

Run: `bun test`
Expected: every test passes.

- [ ] **Step 2: Lint**

Run: `bun run lint`
Expected: no warnings.

- [ ] **Step 3: Tag**

```bash
git tag stage-2.2-features-complete
```

---

## Stage 2.3 — Conformance vectors

**Sub-stage goal:** Hand-author ≥20 SealedTurn vectors plus single-byte mutation pairs. Build a runner that any implementation can use to validate itself. The vectors ARE the product for other implementers.

**Verification:** `bun run conformance/runner.ts` reports `PASS: N/N vectors` with N ≥ 20 base + N mutation; `bun test tests/conformance.test.ts` is green.

---

### Task 2.3.1: Vector authoring helper script

**Files:**
- Create: `tools/gen-vector.ts`

A tiny helper that takes a Turn JSON on stdin and emits a SealedTurn JSON. Used to author vectors so we don't hand-compute hashes.

- [ ] **Step 1: Write the helper**

`tools/gen-vector.ts`:

```ts
#!/usr/bin/env bun
import * as ed from "@noble/ed25519";
import { sealChain } from "../src/seal";
import { Turn } from "../src/schema";
import { z } from "zod";

const text = await Bun.stdin.text();
const input = JSON.parse(text);
const turns = z.array(Turn).parse(input.turns ?? input);
let sign: { privkey: Uint8Array; pubkey: Uint8Array } | undefined;
if (input.key_hex) {
  const privkey = Uint8Array.from(
    Buffer.from(input.key_hex.padEnd(64, "0"), "hex"),
  );
  const pubkey = await ed.getPublicKeyAsync(privkey);
  sign = { privkey, pubkey };
}
const chain = await sealChain(turns, sign);
process.stdout.write(JSON.stringify(chain, null, 2));
```

- [ ] **Step 2: Smoke-test**

Run:

```bash
echo '{"turns":[{"version":"scroll/0.1","turn":0,"role":"user","model":{"vendor":"anthropic","id":"x"},"params":{"temperature":0,"top_p":1},"messages":[{"role":"user","content":"hi"}],"timestamp_ns":1700000000000000000}]}' | bun run tools/gen-vector.ts | head -c 200
```

Expected: JSON SealedTurn array printed.

- [ ] **Step 3: Commit**

```bash
git add tools/gen-vector.ts
git commit -m "tools: gen-vector helper for authoring conformance vectors"
```

---

### Task 2.3.2: Author 20 base vectors

**Files:**
- Create: `conformance/vectors/001-user-text-only.json` through `020-…`

Coverage matrix (each vector is one file containing a single SealedTurn or chain):

```
001  user, text only, no params customization
002  assistant, text only, with custom temperature + top_p
003  assistant, text + seed
004  assistant, text + max_tokens
005  user, content as array of blocks
006  system, text only
007  tool, response text only
008  assistant with one tool_call (args inlined)
009  assistant with one tool_call (args redacted, hash-only)
010  tool with one tool_result (response inlined)
011  tool with one tool_result (response redacted, hash-only, status: error)
012  3-turn chain: user → assistant → user
013  signed: turn 0 with Ed25519 sig (deterministic test key 0x01..0x01)
014  signed: 2-turn chain, both signed
015  signed: 1-turn with redacted tool_call args + sig
016  unicode content (emoji, RTL, combining marks)
017  long content (~10KB string)
018  multiple tool_calls in one turn
019  multiple tool_results in one turn (mixed ok / error)
020  full kitchen-sink turn (params + tool_calls + tool_results + sig)
```

- [ ] **Step 1: Author vector 001 manually**

Create `conformance/vectors/001-user-text-only.json` by piping the input through `tools/gen-vector.ts`:

```bash
mkdir -p conformance/vectors
cat > /tmp/v001-input.json <<'EOF'
{
  "turns": [
    {
      "version": "scroll/0.1",
      "turn": 0,
      "role": "user",
      "model": { "vendor": "anthropic", "id": "claude-opus-4-7" },
      "params": { "temperature": 0, "top_p": 1 },
      "messages": [{ "role": "user", "content": "hello" }],
      "timestamp_ns": 1700000000000000000
    }
  ]
}
EOF
bun run tools/gen-vector.ts < /tmp/v001-input.json > conformance/vectors/001-user-text-only.json
cat conformance/vectors/001-user-text-only.json
```

Expected: a JSON SealedTurn array of length 1, with `hash` field present, `sig` absent.

- [ ] **Step 2: Author vectors 002–020**

For each, create a `/tmp/vNNN-input.json` with the appropriate Turn shape (use vector 001 as a template, varying ONLY the fields named in the coverage matrix), then pipe through `tools/gen-vector.ts`. For signed vectors (013, 014, 015, 020), include `"key_hex": "01"` (will be padded to 32 bytes of `0x01`) in the input wrapper so the test key is deterministic.

After each `bun run tools/gen-vector.ts`, eyeball the output for plausibility (correct schema, hash present, sig where expected).

- [ ] **Step 3: Verify all 20 vectors are committable**

Run: `ls conformance/vectors | wc -l`
Expected: 20.

- [ ] **Step 4: Round-trip-verify each vector through `verify`**

Run a one-shot script:

```bash
for f in conformance/vectors/*.json; do
  echo -n "$(basename "$f"): "
  bun run src/cli.ts verify < "$f" 2>&1 | tail -1
done
```

Expected: every line ends with `ok` (signed-vector signatures are skipped because no `--pubkey` passed; that is fine — chain integrity still verifies).

- [ ] **Step 5: Commit**

```bash
git add conformance/vectors/
git commit -m "conformance: 20 base vectors covering roles, tools, redaction, signing, edge cases"
```

---

### Task 2.3.3: Mutation fixtures

**Files:**
- Create: `conformance/vectors/mutations/NNN-…json` for each base vector

Each mutation file contains a base-vector chain with a single byte flipped somewhere in the canonical body (NOT the hash field). Verify MUST reject every mutation.

- [ ] **Step 1: Author mutation generator script**

Create `tools/gen-mutations.ts`:

```ts
#!/usr/bin/env bun
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, join } from "node:path";

const VEC_DIR = "conformance/vectors";
const MUT_DIR = "conformance/vectors/mutations";

await mkdir(MUT_DIR, { recursive: true });

const files = (await readdir(VEC_DIR)).filter((f) => f.endsWith(".json") && !f.startsWith("mutations"));

for (const f of files) {
  const text = await readFile(join(VEC_DIR, f), "utf8");
  const chain = JSON.parse(text);
  // Flip first character inside the first message's content of turn 0.
  const original = chain[0].messages[0].content;
  const mutated = typeof original === "string"
    ? original.length > 0
      ? (original[0] === "x" ? "y" : "x") + original.slice(1)
      : "x"
    : original; // skip array-content vectors at this layer; they get a different mutation
  if (typeof original === "string") chain[0].messages[0].content = mutated;
  else {
    // Array content: flip a byte in the first block's serialized form by appending a marker char to a key.
    chain[0].messages[0].content = [...original, { type: "text", text: "TAMPERED" }];
  }
  const outName = basename(f, ".json") + "-tampered.json";
  await writeFile(join(MUT_DIR, outName), JSON.stringify(chain, null, 2));
}

console.log(`wrote ${files.length} mutation fixtures to ${MUT_DIR}`);
```

- [ ] **Step 2: Run it**

```bash
bun run tools/gen-mutations.ts
ls conformance/vectors/mutations | wc -l
```

Expected: 20 mutation files.

- [ ] **Step 3: Confirm every mutation is rejected by verify**

```bash
for f in conformance/vectors/mutations/*.json; do
  if bun run src/cli.ts verify < "$f" >/dev/null 2>&1; then
    echo "MUTATION NOT DETECTED: $f"
    exit 1
  fi
done
echo "all mutations rejected ✓"
```

Expected: prints `all mutations rejected ✓`.

- [ ] **Step 4: Commit**

```bash
git add tools/gen-mutations.ts conformance/vectors/mutations/
git commit -m "conformance: 20 single-byte mutation fixtures (all rejected by verify)"
```

---

### Task 2.3.4: `conformance/runner.ts` + `conformance/README.md`

**Files:**
- Create: `conformance/runner.ts`
- Create: `conformance/README.md`

- [ ] **Step 1: Write the runner**

`conformance/runner.ts`:

```ts
#!/usr/bin/env bun
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { verify } from "../src/verify";

const VEC_DIR = "conformance/vectors";
const MUT_DIR = "conformance/vectors/mutations";

let pass = 0, fail = 0;

const baseFiles = (await readdir(VEC_DIR)).filter((f) => f.endsWith(".json"));
for (const f of baseFiles) {
  const chain = JSON.parse(await readFile(join(VEC_DIR, f), "utf8"));
  const r = await verify(chain);
  if (r.ok) {
    pass++;
  } else {
    fail++;
    console.error(`BASE FAIL ${f}: ${JSON.stringify(r.failures)}`);
  }
}

const mutFiles = (await readdir(MUT_DIR)).filter((f) => f.endsWith(".json"));
for (const f of mutFiles) {
  const chain = JSON.parse(await readFile(join(MUT_DIR, f), "utf8"));
  const r = await verify(chain);
  if (!r.ok) {
    pass++;
  } else {
    fail++;
    console.error(`MUTATION SLIPPED ${f}: verify returned ok`);
  }
}

const total = baseFiles.length + mutFiles.length;
console.log(`conformance: PASS ${pass}/${total} (mutations rejected: ${mutFiles.length})`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it**

Run: `bun run conformance/runner.ts`
Expected: exit 0; `PASS 40/40` (20 base accepted + 20 mutations rejected).

- [ ] **Step 3: Write `conformance/README.md`**

```markdown
# agent-scroll conformance vectors

These vectors are the v0.1 conformance bar. Any implementation claiming to be
`agent-scroll`-compatible MUST:

1. Accept every file in `vectors/*.json` as a valid sealed chain (`verify` returns ok).
2. Reject every file in `vectors/mutations/*.json` (`verify` returns a failure).

## Running against the reference implementation

```bash
bun install
bun run conformance/runner.ts
```

## Running against your own implementation

Read the JSON files in `vectors/` (each is a `SealedTurn[]`) and feed them
through your implementation's `verify()` equivalent. The expected outcome
for each file is:

- `vectors/NNN-*.json` → verify passes
- `vectors/mutations/*-tampered.json` → verify fails (any failure mode)

## Notes

- All signed vectors use the deterministic test key `0x0101…01` (32 bytes of
  `0x01`). Pubkey for verification: derive with Ed25519 from this seed.
- Hashes are SHA-256 over JCS-canonical bytes (RFC 8785).
- `args`/`response` plaintext bodies are optional; their `args_hash` /
  `response_hash` siblings are normative.
```

- [ ] **Step 4: Commit**

```bash
git add conformance/runner.ts conformance/README.md
git commit -m "conformance: runner + README"
```

---

### Task 2.3.5: `tests/conformance.test.ts` — wire runner into bun test

**Files:**
- Create: `tests/conformance.test.ts`

- [ ] **Step 1: Write the test**

`tests/conformance.test.ts`:

```ts
import { test, expect } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { verify } from "../src/verify";

const VEC_DIR = "conformance/vectors";
const MUT_DIR = "conformance/vectors/mutations";

test("every base vector verifies", async () => {
  const files = (await readdir(VEC_DIR)).filter((f) => f.endsWith(".json"));
  expect(files.length).toBeGreaterThanOrEqual(20);
  for (const f of files) {
    const chain = JSON.parse(await readFile(join(VEC_DIR, f), "utf8"));
    const r = await verify(chain);
    expect({ file: f, ok: r.ok }).toEqual({ file: f, ok: true });
  }
});

test("every mutation is rejected", async () => {
  const files = (await readdir(MUT_DIR)).filter((f) => f.endsWith(".json"));
  expect(files.length).toBeGreaterThanOrEqual(20);
  for (const f of files) {
    const chain = JSON.parse(await readFile(join(MUT_DIR, f), "utf8"));
    const r = await verify(chain);
    expect({ file: f, ok: r.ok }).toEqual({ file: f, ok: false });
  }
});
```

- [ ] **Step 2: Run it**

Run: `bun test tests/conformance.test.ts`
Expected: 2 PASS.

- [ ] **Step 3: Confirm full run is under 30 seconds**

Run: `time bun test tests/conformance.test.ts`
Expected: real time well under 30s.

- [ ] **Step 4: Commit**

```bash
git add tests/conformance.test.ts
git commit -m "test(conformance): exercise all vectors via bun test"
```

---

### Task 2.3.6: Stage 2.3 close-out

- [ ] **Step 1: Full test run**

Run: `bun test`
Expected: all green.

- [ ] **Step 2: Tag**

```bash
git tag stage-2.3-conformance-complete
```

---

## Stage 2.4 — Security-consideration tests

**Sub-stage goal:** For each SPEC §6 bullet, a focused test (or documented boundary). Most are already covered by mutation fixtures; this stage adds explicit targeted tests for clarity.

**Verification:** `bun test tests/security.test.ts` is green; SPEC §6 bullets each map to a test or a documented "out of scope for v0.1" note.

---

### Task 2.4.1: `tests/security.test.ts` — covers all four SPEC §6 bullets

**Files:**
- Create: `tests/security.test.ts`

- [ ] **Step 1: Write the file in one shot**

`tests/security.test.ts`:

```ts
import { test, expect } from "bun:test";
import { sealChain, verify, hashCanonical } from "../src/index";
import * as ed from "@noble/ed25519";
import type { Turn } from "../src/index";

const baseTurn = (n: number, content: string): Turn => ({
  version: "scroll/0.1",
  turn: n,
  role: n % 2 === 0 ? "user" : "assistant",
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  params: { temperature: 0, top_p: 1 },
  messages: [{ role: n % 2 === 0 ? "user" : "assistant", content }],
  timestamp_ns: 1_700_000_000_000_000_000 + n,
});

// SPEC §6 bullet 1: Tampering any byte inside a turn MUST change its hash.
test("tampering body bytes is detected (BadHash)", async () => {
  const chain = await sealChain([baseTurn(0, "secret"), baseTurn(1, "ack")]);
  const mutated = structuredClone(chain);
  mutated[0]!.messages[0]!.content = "Secret"; // single capital flip
  const r = await verify(mutated);
  expect(r.ok).toBe(false);
});

// SPEC §6 bullet 1 (chain variant): Reordering turns breaks the chain.
test("reordering two turns is detected (BrokenChain or BadHash)", async () => {
  const chain = await sealChain([baseTurn(0, "a"), baseTurn(1, "b"), baseTurn(2, "c")]);
  const mutated = [chain[0], chain[2], chain[1]];
  const r = await verify(mutated);
  expect(r.ok).toBe(false);
});

// SPEC §6 bullet 2: Hash-only redaction — body omitted, hash binds.
test("redacted-at-write turn (hash only, body omitted) verifies", async () => {
  const argsObj = { token: "shhh" };
  const t: Turn = {
    ...baseTurn(0, "calling tool"),
    role: "assistant",
    tool_calls: [{ id: "tu_1", name: "x", args_hash: hashCanonical(argsObj) }],
  };
  const chain = await sealChain([t]);
  expect((await verify(chain)).ok).toBe(true);
});

// SPEC §6 bullet 2 (negative): post-hoc strip of plaintext breaks chain.
test("post-hoc strip of args body is detected (BadHash)", async () => {
  const argsObj = { token: "shhh" };
  const t: Turn = {
    ...baseTurn(0, "calling tool"),
    role: "assistant",
    tool_calls: [{ id: "tu_1", name: "x", args_hash: hashCanonical(argsObj), args: argsObj }],
  };
  const chain = await sealChain([t]);
  const stripped = structuredClone(chain);
  delete stripped[0]!.tool_calls![0]!.args;
  expect((await verify(stripped)).ok).toBe(false);
});

// SPEC §6 signature bullet: BadSignature is reported when sig is mutated.
test("flipping a signature byte is detected (BadSignature)", async () => {
  const privkey = ed.utils.randomPrivateKey();
  const pubkey = await ed.getPublicKeyAsync(privkey);
  const chain = await sealChain([baseTurn(0, "x")], { privkey, pubkey });
  const mutated = structuredClone(chain);
  const sigBytes = Buffer.from(mutated[0]!.sig!.sig, "base64");
  sigBytes[0] = sigBytes[0]! ^ 0x01;
  mutated[0]!.sig!.sig = sigBytes.toString("base64");
  const r = await verify(mutated, pubkey);
  expect(r.ok).toBe(false);
});

// SPEC §6 bullet 3 (replay window): documented as out-of-scope for v0.1 — no test required.
// SPEC §6 bullet 4 (clock skew): timestamp_ns is informational only — no test required.
```

- [ ] **Step 2: Run**

Run: `bun test tests/security.test.ts`
Expected: 5 PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/security.test.ts
git commit -m "test(security): SPEC §6 bullets — tampering, reordering, redaction, post-hoc strip, sig flip"
```

---

### Task 2.4.2: Stage 2.4 close-out

- [ ] **Step 1: Full run**

Run: `bun test`
Expected: all green.

- [ ] **Step 2: Tag**

```bash
git tag stage-2.4-security-complete
```

---

## Stage 2.5 — Demo + release prep

**Sub-stage goal:** Land the 20-line demo, write CI, finalize README Quickstart, freeze SPEC at v1.0, write CHANGELOG, build the binary. Do NOT push or publish.

**Verification:** A clean checkout runs `bun install && bun test && bun run demo` in under 60 seconds with all-green output.

---

### Task 2.5.1: `examples/conversation.json` — sample input

**Files:**
- Create: `examples/conversation.json`

- [ ] **Step 1: Write the file**

`examples/conversation.json`:

```json
{
  "model": { "vendor": "anthropic", "id": "claude-opus-4-7" },
  "params": { "temperature": 0, "top_p": 1 },
  "messages": [
    { "role": "user", "content": "what's 2+2?" },
    { "role": "assistant", "content": "4." },
    { "role": "user", "content": "thanks" }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add examples/conversation.json
git commit -m "examples: small Anthropic-shaped 3-turn sample conversation"
```

---

### Task 2.5.2: `examples/demo.ts` — the 20-line demo

**Files:**
- Create: `examples/demo.ts`

- [ ] **Step 1: Write the demo**

`examples/demo.ts`:

```ts
#!/usr/bin/env bun
import * as ed from "@noble/ed25519";
import { sealChain, verify } from "../src/index";
import { fromAnthropic } from "./from-anthropic";
import convo from "./conversation.json" with { type: "json" };

const privkey = Uint8Array.from(Buffer.from("01".repeat(32), "hex"));
const pubkey = await ed.getPublicKeyAsync(privkey);

const turns = fromAnthropic({ ...convo, timestamp_ns_base: 1_700_000_000_000_000_000 });
const chain = await sealChain(turns, { privkey, pubkey });
console.log(`sealed ${chain.length} turns; head hash = ${chain.at(-1)?.hash}`);

console.log("verify (clean):", (await verify(chain, pubkey)).ok ? "✓" : "✗");

const tampered = structuredClone(chain);
tampered[1]!.messages[0]!.content = "5.";
console.log("verify (tampered):", (await verify(tampered, pubkey)).ok ? "✓" : "✗ (expected)");
```

- [ ] **Step 2: Run it**

Run: `bun run demo`
Expected output (3 lines):
```
sealed 3 turns; head hash = sha256:...
verify (clean): ✓
verify (tampered): ✗ (expected)
```

- [ ] **Step 3: Confirm line count is ≤ 20**

Run: `wc -l examples/demo.ts`
Expected: ≤ 20 (excluding the shebang or counting it — either way under target).

- [ ] **Step 4: Commit**

```bash
git add examples/demo.ts
git commit -m "examples: 20-line demo — fromAnthropic → sealChain → verify (clean + tampered)"
```

---

### Task 2.5.3: README Quickstart update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the `## Status` and `## What` sections with Quickstart**

Edit `README.md`. Replace the existing `## Status` section with a `## Quickstart` and update the status to v0.1.0.

Replace `## Status` block:

```markdown
## Status

**0.0 — design phase.** Draft spec in [SPEC.md](./SPEC.md). No code yet.
```

With:

```markdown
## Status

**v0.1.0** — first working release. Spec frozen at [SPEC.md](./SPEC.md) v1.0.

## Quickstart

```bash
bun install
bun test                     # all green: schema, canonical, seal, verify, conformance
bun run demo                 # seals a 3-turn conversation, verifies, then proves tampering breaks it
```

Run the conformance vectors against this implementation:

```bash
bun run conformance
```
```

- [ ] **Step 2: Verify the Quickstart commands run on a clean tree**

```bash
bun install && bun test && bun run demo && bun run conformance
```

Expected: all four commands succeed.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): v0.1.0 status + Quickstart"
```

---

### Task 2.5.4: SPEC §4 amendment + version banner flip

**Files:**
- Modify: `SPEC.md`

- [ ] **Step 1: Pin signature scope in §4**

Find the `## 4. Sealing` section. Append immediately after the `SealedTurn` JSON block:

```markdown
The `sig.sig` value MUST be the Ed25519 signature over the canonical encoding (per §2) of the turn with `hash` and `sig` fields removed — i.e. over exactly the same bytes used to compute `hash`. Verifiers MUST recompute these bytes from the parsed turn rather than trusting any cached canonical form.
```

- [ ] **Step 2: Flip the status banner**

Replace:

```markdown
# agent-scroll — v0.1 specification (DRAFT)

**Status:** draft, not yet implemented.
```

With:

```markdown
# agent-scroll — v1.0 specification

**Status:** v1.0 (released alongside agent-scroll v0.1.0).
```

- [ ] **Step 3: Sanity-check the spec still mentions §3.1 (single Anthropic mapping) and §3.2 (redaction-at-write-time)**

Run: `grep -n "Anthropic Messages, in" SPEC.md && grep -n "Redaction at write time" SPEC.md`
Expected: both found (added in Stage 1).

- [ ] **Step 4: Commit**

```bash
git add SPEC.md
git commit -m "spec: pin signature scope in §4; flip banner to v1.0"
```

---

### Task 2.5.5: `CHANGELOG.md`

**Files:**
- Create: `CHANGELOG.md`

- [ ] **Step 1: Write it**

`CHANGELOG.md`:

```markdown
# Changelog

All notable changes to `agent-scroll` will be documented in this file.

## [0.1.0] — 2026-04-24

First release.

### Added
- Canonical JCS (RFC 8785) serialization of `Turn` and `SealedTurn` shapes (`canonical`, `hashCanonical`).
- Per-turn SHA-256 hash + `prev_hash` chain (`seal`, `sealChain`).
- Optional Ed25519 signing (`@noble/ed25519`).
- `verify(chain, pubkey?)` with structured failures: `BadHash`, `BrokenChain`, `BadSignature`, `SchemaViolation`.
- `serialize` / `deserialize` round-trip helpers.
- `scroll` CLI: `canon`, `seal`, `verify`.
- `examples/from-anthropic.ts` recipe — Anthropic Messages → `Turn[]`.
- 20 base conformance vectors plus 20 single-byte mutation fixtures in `conformance/`.
- Single-binary build via `bun build --compile`.

### Spec
- SPEC frozen at v1.0:
  - §3.1 narrowed to a single Anthropic mapping for v0.1; OpenAI + Google deferred.
  - §3.2 added — redaction is decided at write time and is permanent.
  - §4 pinned — signatures cover canonical bytes with `hash` and `sig` removed.

### Deferred to v0.2
- Deterministic CBOR (RFC 8949 §4.2) encoding.
- OpenAI Responses and Google AI generate-content vendor mappings.
- Verifier-side replay-window enforcement.
- DID-resolver integration for signer pubkeys.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: CHANGELOG v0.1.0"
```

---

### Task 2.5.6: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

`.github/workflows/ci.yml`:

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bun test
      - run: bun run demo
      - run: bun run conformance
      - run: bun run build
      - run: ./dist/scroll canon < examples/conversation.json | head -c 80 && echo
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: bun install + lint + test + demo + conformance + compile"
```

---

### Task 2.5.7: `bun build --compile` smoke test

- [ ] **Step 1: Build the binary**

Run:

```bash
mkdir -p dist
bun run build
ls -la dist/scroll
```

Expected: a single executable file at `dist/scroll`, ~30–60 MB, executable bit set.

- [ ] **Step 2: Smoke-test all three subcommands via the binary**

```bash
echo '{"b":1,"a":2}' | ./dist/scroll canon
# Expected stdout: {"a":2,"b":1}

cat examples/conversation.json | bun run examples/from-anthropic.ts > /tmp/turns.json   # if needed; or skip if you trust seal
echo '[{"version":"scroll/0.1","turn":0,"role":"user","model":{"vendor":"anthropic","id":"x"},"params":{"temperature":0,"top_p":1},"messages":[{"role":"user","content":"hi"}],"timestamp_ns":1700000000000000000}]' \
  | ./dist/scroll seal \
  | ./dist/scroll verify
# Expected stdout from verify: ok
```

- [ ] **Step 3: Commit dist/.gitignore (do NOT commit the binary itself)**

Append to `.gitignore` if not already present:

```
dist/
```

Run: `git status` — confirm `dist/scroll` is not tracked.

- [ ] **Step 4: No commit needed unless .gitignore changed**

If `.gitignore` was updated:

```bash
git add .gitignore
git commit -m "chore: ignore dist/"
```

---

### Task 2.5.8: Stage 6 prep — local tag + handoff

- [ ] **Step 1: Final full clean-room verification**

```bash
rm -rf node_modules dist bun.lock
bun install
bun run lint
bun test
bun run demo
bun run conformance
bun run build
```

Expected: every step succeeds; final test-run summary shows zero failures.

- [ ] **Step 2: Confirm `git status` clean**

Run: `git status`
Expected: clean.

- [ ] **Step 3: Tag locally — DO NOT PUSH**

```bash
git tag -a v0.1.0 -m "agent-scroll v0.1.0 — first release"
git tag --list
```

Expected: `v0.1.0` listed.

- [ ] **Step 4: Stop and ask the user before publishing**

Print to console (or note in the handoff message): "Local tag v0.1.0 created. Awaiting explicit user confirmation before pushing tags or publishing to npm."

---

## Self-review checklist (run before declaring plan complete)

- [ ] Every IN-V0.1 feature in `SCOPE.md` maps to at least one task above.
- [ ] Every (Cn) clause in SPEC §7 maps to a test:
  - C1 (byte-identical) → `tests/canonical.test.ts` + conformance vectors.
  - C2 (single-byte detect) → `tests/security.test.ts` + conformance mutation fixtures.
  - C3 (round-trip) → `tests/roundtrip.test.ts`.
  - C4 (chain integrity) → `tests/verify.test.ts` + `tests/security.test.ts` (reorder).
- [ ] Every SPEC §6 bullet maps to a test or a documented out-of-scope note (Task 2.4.1).
- [ ] No task says "TBD", "fill in details", or references undefined types/functions.
- [ ] Method/type names are consistent across tasks (`seal`, `sealChain`, `verify`, `serialize`, `deserialize`, `Turn`, `SealedTurn`, `VerifyResult`, `VerifyFailure`, `Sig`).
- [ ] No file in the file map exceeds the 200-line guideline; if it does, the plan splits it.
- [ ] Demo is ≤ 20 lines (Task 2.5.2 verifies via `wc -l`).
- [ ] Quickstart is ≤ 3 commands (Task 2.5.3 sets it to `bun install && bun test && bun run demo`).
