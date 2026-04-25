# Concepts

This document builds the mental model you need to use agent-scroll correctly. Read it once; you won't need to re-read the spec for everyday use.

---

## Three nouns

**Turn** — a single normalized exchange in an agent conversation. It carries a request (messages), an optional response (also in messages), tool calls, tool results, the model that produced it, and sampling parameters. A `Turn` has no hash yet.

**SealedTurn** — a `Turn` plus a `hash` field (and optionally a `sig` field). Once sealed, the canonical bytes of the turn are pinned. Any mutation breaks the hash.

**Scroll** — an ordered array of `SealedTurn` values. The word "scroll" is informal; the library just uses `SealedTurn[]`. Sealing a scroll means each turn's `prev_hash` links to the prior turn's `hash`, forming a chain.

---

## The schema in one diagram

Every `Turn` has these fields. Starred fields are optional.

| Field | Type | Description |
|---|---|---|
| `version` | `"scroll/0.1"` | Schema version literal — always this exact string. |
| `turn` | `uint` | Zero-based turn index within the scroll. |
| `role` | `"user" \| "assistant" \| "tool" \| "system"` | Who authored this turn. |
| `model.vendor` | `string` | e.g. `"anthropic"`, `"openai"`, `"google"`. |
| `model.id` | `string` | e.g. `"claude-opus-4-7"`. |
| `model.fingerprint` | `string` ★ | Opaque server-side fingerprint when available. |
| `params.temperature` | `number` | Sampling temperature. |
| `params.top_p` | `number` | Nucleus sampling parameter. |
| `params.seed` | `int` ★ | Reproducibility seed. |
| `params.max_tokens` | `int` ★ | Token cap, when set. |
| `messages` | `Message[]` | One or more `{ role, content }` pairs. Content is a string or block array. |
| `tool_calls` | `ToolCall[]` ★ | Tool invocations. Each has `id`, `name`, `args_hash`, and optional `args`. |
| `tool_results` | `ToolResult[]` ★ | Tool responses. Each has `id`, `status`, `response_hash`, optional `response`. |
| `timestamp_ns` | `uint` | Wall-clock nanoseconds (informational; not a validity window). |
| `prev_hash` | `"sha256:<hex>"` ★ | Hash of the previous `SealedTurn`. Absent on turn 0. |

`SealedTurn` adds:

| Field | Type | Description |
|---|---|---|
| `hash` | `"sha256:<hex>"` | SHA-256 of canonical(turn). |
| `sig` ★ | `{ alg: "ed25519", pubkey: string, sig: string }` | Ed25519 signature over the same bytes. |

Full Zod schemas live in [`src/schema.ts`](../src/schema.ts).

---

## Canonical encoding

JSON has no canonical form. Two programs serializing the same object can produce different bytes: key order varies by runtime, floats round differently, whitespace is arbitrary. Those differences make hashing unstable — the same logical object produces different hashes depending on where it was serialized.

agent-scroll uses [JCS — JSON Canonicalization Scheme (RFC 8785)](https://www.rfc-editor.org/rfc/rfc8785). JCS mandates:

- Keys sorted lexicographically (Unicode code-point order).
- No whitespace outside strings.
- Numbers formatted per IEEE 754 double rules, without trailing zeros.
- Strings escaped per the spec (only what must be escaped is escaped).

The `canonical` package implements this. The `canonical(value)` function in [`src/canonical.ts`](../src/canonical.ts) wraps it: call `canonicalize(value)`, throw if undefined (i.e. the value contains something unrepresentable), then return UTF-8 bytes.

Values that JCS cannot represent — and that you therefore cannot put in a Turn — include:

- JavaScript `undefined`
- `Symbol`
- `BigInt`
- `NaN`
- `Infinity` / `-Infinity`
- Functions

Avoid these in any object you pass to `canonical` or `hashCanonical`. Zod's schema validation will catch them before sealing if they appear in a `Turn`.

---

## The hash chain

Each sealed turn (after the first) includes a `prev_hash` field that contains the `hash` of the turn immediately before it. This forms a chain: if you tamper with turn N, its hash changes, which breaks turn N+1's `prev_hash` check, and so on.

`sealChain` constructs this linkage automatically:

```typescript
import { sealChain } from "./src/index";

const chain = await sealChain([turn0, turn1, turn2]);
// chain[0].prev_hash === undefined
// chain[1].prev_hash === chain[0].hash
// chain[2].prev_hash === chain[1].hash
```

`verify` checks chain integrity at position `i > 0` by confirming `sealed[i].prev_hash === sealed[i-1].hash`. A mismatch produces a `BrokenChain` failure for turn `i`.

You can also build chains manually: set `prev_hash` on each `Turn` before calling `seal`. `sealChain` only fills in `prev_hash` when the caller left it undefined — it will not overwrite a value you set explicitly.

---

## Signatures: what they cover

From [SPEC §4](../SPEC.md):

> The `sig.sig` value MUST be the Ed25519 signature over the canonical encoding of the turn with `hash` and `sig` fields removed — i.e. over exactly the same bytes used to compute `hash`.

In other words, the signature covers `canonical(turn)` where `turn` is the raw `Turn` object without the `hash` or `sig` fields. The `hash` field is then `sha256` of those same bytes.

This design has an important consequence: the signature and the chain hash pin exactly the same content. Verifying the signature is equivalent to verifying the hash, minus the trust in the verifier itself. You cannot forge a turn that has a valid hash but an invalid signature, or vice versa.

In code, `verify` implements this as:

```typescript
const { hash, sig, ...turnOnly } = sealed;
if (hashCanonical(turnOnly) !== hash) { /* BadHash */ }
if (sig && pubkey) {
  const ok = await ed.verifyAsync(sigBytes, canonical(turnOnly), pubkey);
  if (!ok) { /* BadSignature */ }
}
```

See [`src/verify.ts`](../src/verify.ts) for the full implementation.

---

## Redaction at write time

Tool calls often carry PII: SSNs, API keys, personal documents. agent-scroll lets you commit a cryptographic binding to that content without storing the plaintext.

Every `tool_calls` entry has `args_hash` (required) and `args` (optional). Every `tool_results` entry has `response_hash` (required) and `response` (optional). The hash is `sha256(canonical(args))`.

From [SPEC §3.2](../SPEC.md):

> The decision to include the plaintext body is made by the writer at turn-construction time. Either choice is valid, but it is permanent: once the turn is sealed, stripping the plaintext body changes the canonical bytes and breaks the chain hash.

The key counter-intuitive point: you cannot seal a turn with `args` present and later strip `args` without breaking the hash. The library deliberately makes post-hoc redaction detectable. If you need a redacted log, decide at write time:

```typescript
import { hashCanonical } from "./src/index";

const sensitiveArgs = { ssn: "123-45-6789" };

// Option A: redact at write time — hash only, no plaintext.
const tool_calls_redacted = [{
  id: "tu_1",
  name: "lookup_user",
  args_hash: hashCanonical(sensitiveArgs),
  // args intentionally omitted
}];

// Option B: keep plaintext — hash + body both in canonical bytes.
const tool_calls_full = [{
  id: "tu_1",
  name: "lookup_user",
  args_hash: hashCanonical(sensitiveArgs),
  args: sensitiveArgs,
}];
```

Pick once. Verify confirms whichever you chose. Stripping `args` after sealing is caught as `BadHash`.

---

## Vendor normalization

Every LLM vendor ships conversations in a different shape. Anthropic uses `tool_use` / `tool_result` content blocks. OpenAI Responses uses `output` items with `call_id`. Google AI uses proto-shaped `generateContent` responses.

Normalization means mapping a vendor's shape to the `Turn` schema before hashing. v0.1 ships one normative mapping: Anthropic Messages, in [`examples/from-anthropic.ts`](../examples/from-anthropic.ts). OpenAI and Google mappings are planned for v0.2 ([SPEC §3.1](../SPEC.md)).

Normalization happens before `seal`. Once a `Turn` is in canonical form and sealed, the downstream library doesn't care which vendor produced it. See [docs/integrations.md](./integrations.md) for recipes.

---

## VerifyResult discriminated union

`verify` returns `{ ok: true }` or `{ ok: false; failures: VerifyFailure[] }`. Each failure names the turn index and a reason string.

| Reason | You see this when… |
|---|---|
| `BadHash` | The turn body was mutated after sealing. `hashCanonical(turnOnly)` doesn't match `sealed.hash`. |
| `BrokenChain` | `sealed[i].prev_hash` doesn't match `sealed[i-1].hash`. A turn was inserted, removed, or reordered. |
| `BadSignature` | Ed25519 signature verification failed. The turn may have been tampered with, or the wrong pubkey was passed. |
| `SchemaViolation` | The object at position `i` doesn't conform to the `SealedTurn` schema. `detail` carries the Zod error message. |

Multiple failures can coexist — a mutated turn can trigger both `BadHash` and `BrokenChain` on subsequent turns. Iterate `result.failures` and handle each.

```typescript
import { verify } from "./src/index";

const result = await verify(chain, pubkey);
if (!result.ok) {
  for (const f of result.failures) {
    if (f.reason === "SchemaViolation") {
      console.error(`turn ${f.turn}: schema violation — ${f.detail}`);
    } else {
      console.error(`turn ${f.turn}: ${f.reason}`);
    }
  }
}
```

The `detail` field is only present on `SchemaViolation`. TypeScript's discriminated union (`f.reason === "SchemaViolation"`) narrows the type so `f.detail` is accessible.
