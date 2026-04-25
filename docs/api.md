# API Reference

All exports from `agent-scroll` (`src/index.ts`). Functions are async where noted; types are TypeScript interfaces inferred from Zod schemas.

---

## Functions

### `serialize`

```typescript
function serialize(value: Turn | SealedTurn): Uint8Array
```

Encodes a `Turn` or `SealedTurn` to canonical JCS bytes. The output is valid UTF-8 JSON with deterministic key order and no whitespace.

**Parameters**

| Name | Type | Notes |
|---|---|---|
| `value` | `Turn \| SealedTurn` | Must be a schema-valid object. |

**Returns** `Uint8Array` — canonical bytes. Always the same bytes for the same logical value.

**Throws** if `value` contains unrepresentable JavaScript values (`undefined`, `NaN`, `Infinity`, `BigInt`, `Symbol`).

**Example**

```typescript
import { seal, serialize } from "agent-scroll";
import type { Turn } from "agent-scroll";

const turn: Turn = {
  version: "scroll/0.1",
  turn: 0,
  role: "user",
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  params: { temperature: 0, top_p: 1 },
  messages: [{ role: "user", content: "hello" }],
  timestamp_ns: 1_700_000_000_000_000_000,
};
const sealed = await seal(turn);
const bytes = serialize(sealed);
// Write to disk, DB, IPFS, etc.
```

---

### `deserialize`

```typescript
function deserialize(bytes: Uint8Array): SealedTurn | Turn
```

Parses canonical bytes back into a `SealedTurn` if the `hash` field is present, or a `Turn` otherwise.

**Parameters**

| Name | Type | Notes |
|---|---|---|
| `bytes` | `Uint8Array` | UTF-8 JCS JSON, typically from `serialize`. |

**Returns** `SealedTurn | Turn`.

**Throws** `ZodError` if the parsed JSON does not conform to either schema.

**Example**

```typescript
import { deserialize, verify } from "agent-scroll";
import { readFileSync } from "node:fs";

const bytes = readFileSync("turn-0.json");
const sealed = deserialize(bytes);
const result = await verify([sealed]);
```

---

### `canonical`

```typescript
function canonical(value: unknown): Uint8Array
```

Returns the JCS-canonical encoding of any JSON-representable value. This is the primitive underlying `serialize` and `hashCanonical`. Use it when you need the raw bytes — for example, when computing a hash of tool args before building a turn.

**Parameters**

| Name | Type | Notes |
|---|---|---|
| `value` | `unknown` | Any JSON-representable value. |

**Returns** `Uint8Array` — UTF-8 JCS bytes.

**Throws** if `value` is not representable in JCS (functions, `Symbol`, `BigInt`, `NaN`, `Infinity`, `undefined`).

**Example**

```typescript
import { canonical } from "agent-scroll";

const bytes = canonical({ b: 2, a: 1 });
// Uint8Array of: {"a":1,"b":2}
```

---

### `hashCanonical`

```typescript
function hashCanonical(value: unknown): string
```

Returns `"sha256:<hex>"` — the SHA-256 hash of `canonical(value)`. Use this to compute `args_hash` and `response_hash` when building tool calls and results.

**Parameters**

| Name | Type | Notes |
|---|---|---|
| `value` | `unknown` | Any JSON-representable value. |

**Returns** `string` matching the pattern `sha256:[0-9a-f]{64}`.

**Example**

```typescript
import { hashCanonical } from "agent-scroll";

const args = { query: "agent-scroll", limit: 10 };
const args_hash = hashCanonical(args);
// "sha256:e3b0..."
```

---

### `seal`

```typescript
async function seal(turn: Turn, sign?: SignOpts): Promise<SealedTurn>
```

Seals a single turn: computes `sha256(canonical(turn))` and attaches it as `hash`. If `sign` is provided, also signs the same canonical bytes with Ed25519 and attaches `sig`.

**Parameters**

| Name | Type | Notes |
|---|---|---|
| `turn` | `Turn` | A schema-valid turn. Must not already be sealed. |
| `sign` | `SignOpts` ★ | Optional. `{ privkey: Uint8Array, pubkey: Uint8Array }`. Raw Ed25519 key bytes (32 bytes each). |

**Returns** `Promise<SealedTurn>`.

**Example**

```typescript
import { seal } from "agent-scroll";
import type { Turn } from "agent-scroll";
import * as ed from "@noble/ed25519";

const turn: Turn = {
  version: "scroll/0.1",
  turn: 0,
  role: "user",
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  params: { temperature: 0, top_p: 1 },
  messages: [{ role: "user", content: "hi" }],
  timestamp_ns: 1_700_000_000_000_000_000,
};

const sealed = await seal(turn);                             // unsigned
const privkey = ed.utils.randomPrivateKey();
const pubkey = await ed.getPublicKeyAsync(privkey);
const sealedSigned = await seal(turn, { privkey, pubkey }); // signed
```

---

### `sealChain`

```typescript
async function sealChain(turns: Turn[], sign?: SignOpts): Promise<SealedTurn[]>
```

Seals an ordered array of turns, automatically linking each turn's `prev_hash` to the prior sealed turn's `hash`. If a turn already has `prev_hash` set, that value is preserved.

**Parameters**

| Name | Type | Notes |
|---|---|---|
| `turns` | `Turn[]` | Ordered turns. Turn 0 gets no `prev_hash` unless it already has one. |
| `sign` | `SignOpts` ★ | Optional. Applied to every turn in the chain. |

**Returns** `Promise<SealedTurn[]>` — same length as `turns`.

**Example**

```typescript
import { sealChain, verify } from "agent-scroll";
import type { Turn } from "agent-scroll";

const turns: Turn[] = [
  { version: "scroll/0.1", turn: 0, role: "user",
    model: { vendor: "demo", id: "v0" }, params: { temperature: 0, top_p: 1 },
    messages: [{ role: "user", content: "hello" }], timestamp_ns: 0 },
  { version: "scroll/0.1", turn: 1, role: "assistant",
    model: { vendor: "demo", id: "v0" }, params: { temperature: 0, top_p: 1 },
    messages: [{ role: "assistant", content: "hi" }], timestamp_ns: 1 },
];

const chain = await sealChain(turns);
console.log(chain[1]?.prev_hash === chain[0]?.hash); // true
```

---

### `verify`

```typescript
async function verify(chain: unknown[], pubkey?: Uint8Array): Promise<VerifyResult>
```

Walks a chain of sealed turns. For each turn: parses the schema, recomputes the hash, checks `prev_hash` linkage (for turns after the first), and optionally verifies the Ed25519 signature.

**Parameters**

| Name | Type | Notes |
|---|---|---|
| `chain` | `unknown[]` | Array of values to verify. Accepts `SealedTurn[]` or raw parsed JSON. |
| `pubkey` | `Uint8Array` ★ | If provided, verifies signatures on every turn that has a `sig` field. |

**Returns** `Promise<VerifyResult>` — `{ ok: true }` or `{ ok: false; failures: VerifyFailure[] }`.

**Throws** never — all errors are reported as `VerifyFailure` entries.

**Example**

```typescript
import { verify } from "agent-scroll";

const result = await verify(chain, pubkey);
if (!result.ok) {
  for (const f of result.failures) {
    console.error(`turn ${f.turn}: ${f.reason}`);
  }
}
```

---

## Types

### `Turn`

The unsealed turn schema. Construct one before calling `seal` or `sealChain`. See [docs/concepts.md](./concepts.md) for a field-by-field table.

```typescript
import type { Turn } from "agent-scroll";
```

### `SealedTurn`

A `Turn` extended with `hash: string` (required) and `sig?: Sig` (optional). Returned by `seal` and `sealChain`. Accepted by `verify` and `serialize`.

```typescript
import type { SealedTurn } from "agent-scroll";
```

### `Sig`

The signature object attached to a `SealedTurn` when signing options are provided.

```typescript
type Sig = {
  alg: "ed25519";
  pubkey: string;  // base64-encoded 32-byte Ed25519 public key
  sig: string;     // base64-encoded 64-byte Ed25519 signature
};
```

### `SignOpts`

Passed as the second argument to `seal` and `sealChain`.

```typescript
type SignOpts = {
  privkey: Uint8Array;  // 32-byte Ed25519 private key
  pubkey: Uint8Array;   // 32-byte Ed25519 public key
};
```

### `VerifyResult`

Discriminated union returned by `verify`.

```typescript
type VerifyResult = { ok: true } | { ok: false; failures: VerifyFailure[] };
```

### `VerifyFailure`

Per-turn failure reported by `verify`. Only `SchemaViolation` has a `detail` field.

```typescript
type VerifyFailure =
  | { turn: number; reason: "BadHash" }
  | { turn: number; reason: "BrokenChain" }
  | { turn: number; reason: "BadSignature" }
  | { turn: number; reason: "SchemaViolation"; detail: string };
```

---

## CLI

The `scroll` binary provides the same surface on stdin/stdout. Build it with `bun run build` to get a single binary in `dist/scroll`.

### `scroll canon`

Read JSON from stdin, write canonical JCS bytes to stdout.

```bash
echo '{"b":2,"a":1}' | scroll canon
# {"a":1,"b":2}
```

**Stdin:** any JSON value.
**Stdout:** canonical JCS bytes.
**Exit:** 0 on success, 1 on parse error.

---

### `scroll seal`

Read a `Turn[]` JSON array from stdin, write a `SealedTurn[]` JSON array to stdout.

```bash
# Without a key — hash-only sealing:
cat turns.json | scroll seal

# With a key — signs each turn with Ed25519:
cat turns.json | scroll seal --key <64-char hex private key>
```

**Flags**

| Flag | Type | Notes |
|---|---|---|
| `--key <hex>` | 32-byte hex (64 chars) | Ed25519 private key. Public key is derived automatically. Optional. |

**Stdin:** `Turn[]` JSON.
**Stdout:** `SealedTurn[]` JSON.
**Exit:** 0 on success, 1 on schema or key error.

---

### `scroll verify`

Read a `SealedTurn[]` JSON array from stdin, exit 0 if the chain is valid, exit 1 otherwise.

```bash
# Hash-chain only:
cat sealed.json | scroll verify

# Including signature verification:
cat sealed.json | scroll verify --pubkey <64-char hex public key>
```

**Flags**

| Flag | Type | Notes |
|---|---|---|
| `--pubkey <hex>` | 32-byte hex (64 chars) | Ed25519 public key. If omitted, signatures are not checked. |

**Stdin:** `SealedTurn[]` JSON.
**Stdout:** `ok\n` on success.
**Stderr:** one line per failure: `turn <n>: <reason> [(<detail>)]`.
**Exit:** 0 if valid, 1 if any failure.
