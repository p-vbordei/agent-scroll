# agent-scroll

> **Canonical, byte-deterministic, hash-chained transcripts for AI-agent conversations.**
> Sign once. Verify forever. Replay anywhere.

[![spec](https://img.shields.io/badge/spec-v1.0-success)](./SPEC.md)
[![tests](https://img.shields.io/badge/tests-42%20passing-brightgreen)](./tests)
[![conformance](https://img.shields.io/badge/conformance-C1%E2%80%93C4-blue)](./conformance)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](./LICENSE)

`agent-scroll` is the **format** an AI-agent conversation lives in once you want to prove what was said, who said it, and that it hasn't been tampered with. It's a tiny TypeScript library plus a single-binary CLI plus a frozen [normative spec](./SPEC.md) — all built so that two independent implementations of the spec, fed the same conversation, **produce byte-identical bytes**.

That property — byte equality — is the entire point. It's what makes a scroll usable as audit evidence, dispute artifacts, replay anchors, and reproducibility receipts.

---

## 60-second demo

```bash
git clone <this-repo> && cd agent-scroll
bun install
bun examples/demo.ts
```

```text
canonical turn 0: {"hash":"sha256:1f5d…","messages":[{"content":"hello",…}],"sig":{…}}
verify clean:  ✓
verify tamper: ✓ caught
```

That's the whole product: deterministic bytes, a chain of hashes, optional Ed25519 signatures, and a verifier that catches any single-byte mutation.

---

## Why this exists

Every LLM vendor emits conversations in a different shape: Anthropic ships `tool_use`/`tool_result` blocks, OpenAI Responses ships `output` items with `call_id`, Google AI Studio ships proto-shaped records. Observability platforms (LangSmith, Langfuse, OpenTelemetry GenAI) capture all of it but **don't canonicalize** — their JSON shifts under whitespace, key ordering, and float formatting.

[W3C VC Data Integrity 1.0](https://www.w3.org/TR/vc-data-integrity/) provides a generic `transform → hash → sign` pipeline. [JCS (RFC 8785)](https://www.rfc-editor.org/rfc/rfc8785) and [deterministic CBOR (RFC 8949 §4.2)](https://datatracker.ietf.org/doc/html/rfc8949) provide canonical encodings. **Nobody had assembled them into a conversation-shaped format with a hash chain and per-turn signatures.**

`agent-scroll` is that assembly. A 30-page spec + a ~600-line reference implementation + 20 golden vectors + 4 (Cn) conformance tests. That's it.

---

## Use cases

| Use case | How scroll helps |
|---|---|
| **Audit trail** for an agent's decisions | Every turn is hashed; rewriting any byte breaks `verify`. |
| **Legal evidence** in a dispute | Ed25519 signatures bind each turn to a verifiable principal (DID, key, etc.). |
| **Reproducibility receipts** | `expected.transcript_sha256` in [`agent-rerun`](../agent-rerun/) is computed over scroll-canonical bytes, so two replays with the same model + seed are byte-comparable. |
| **Privacy-preserving logs** | A turn can ship `args_hash` only; the plaintext body is omitted but the hash still binds the redacted content. |
| **Cross-vendor portability** | Anthropic / OpenAI / Google conversations normalize to one schema before hashing. |

---

## Quickstart

```bash
bun install               # ~5 seconds, ~20 packages
bun test                  # 42 tests across 11 files
bun examples/demo.ts      # the 60-second demo above
bun conformance/runner.ts # C1–C4 conformance: 4/4 vectors pass
```

That's it. No Docker, no databases, no services. The whole library + CLI compiles to a **single 58 MB binary** with `bun run build`.

---

## API at a glance

The entire public surface is **four functions plus types**:

```typescript
import { seal, sealChain, verify, canonical } from "agent-scroll";
import type { Turn, SealedTurn, VerifyResult } from "agent-scroll";

// 1. Build a turn (matches the schema in SPEC §3).
const t: Turn = {
  version: "scroll/0.1",
  turn: 0,
  role: "user",
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  params: { temperature: 0, top_p: 1 },
  messages: [{ role: "user", content: "what's 2+2?" }],
  timestamp_ns: 1_700_000_000_000_000_000,
};

// 2. Seal it. With a key: signed. Without: unsigned (still hash-chained).
const sealed = await seal(t, { privkey, pubkey });

// 3. Verify a chain. Pubkey is optional; without it, signatures are skipped.
const result = await verify([sealed], pubkey);
//   ↳ { ok: true } | { ok: false; failures: [{ turn, reason }] }
```

Plus three other small surfaces:
- `serialize(value) → Uint8Array` and `deserialize(bytes) → Turn | SealedTurn` for IO.
- `canonical(value) → Uint8Array` and `hashCanonical(value) → "sha256:..."` for hashing arbitrary JSON-y values.
- A `scroll` CLI: `scroll canon`, `scroll seal`, `scroll verify` — same surface as the library, on stdin/stdout.

Full reference: [docs/api.md](./docs/api.md).

---

## How it works (3-step mental model)

1. **Build a `Turn`.** A normalized record: role, model, sampling params, messages, optional tool calls and results, a nanosecond timestamp.
2. **`seal(turn, sign?)`.** Computes `sha256(canonical(turn))`, attaches it as `hash`. If a signing key is supplied, also signs the same canonical bytes with Ed25519.
3. **`verify(chain, pubkey?)`.** Walks the chain. For each turn: re-canonicalize, recompute hash, compare; check `prev_hash` linkage; if `pubkey` provided and a `sig` is present, verify the signature. Returns structured failures: `BadHash`, `BrokenChain`, `BadSignature`, `SchemaViolation`.

That's the whole thing. Everything else — vendor mapping, redaction, conformance — composes from those three operations.

Deeper: [docs/concepts.md](./docs/concepts.md).

---

## Conformance — the conformance bar IS the product

Implementations claiming to be `agent-scroll`-compatible MUST:

- **(C1)** Produce byte-identical canonical bytes for the same turn as any other conforming implementation.
- **(C2)** Detect any single-byte mutation of the canonical encoding.
- **(C3)** Round-trip: `deserialize(serialize(x))` preserves all normative fields.
- **(C4)** Reject reordered turns or rewritten `prev_hash`.

The bar is mechanically checkable: 20 golden JSON vectors in [`conformance/vectors/`](./conformance/vectors/) plus 20 single-byte mutation fixtures in [`conformance/vectors/mutations/`](./conformance/vectors/mutations/) plus 4 programmatic conformance scripts (one per Cn) all wired through a single runner.

Run them against this implementation:

```bash
bun conformance/runner.ts
```

Run them against your own (any language): the JSON files are the contract. See [conformance/README.md](./conformance/README.md).

---

## How it compares

| | canonical bytes | hash chain | per-turn signature | redaction-aware | vendor-neutral |
|---|---|---|---|---|---|
| **`agent-scroll`** | ✓ JCS (RFC 8785) | ✓ SHA-256 | ✓ Ed25519, optional | ✓ at write time | ✓ |
| OpenTelemetry GenAI | — | — | — | — | ✓ (observability) |
| LangSmith / Langfuse | — | — | — | — | ✓ (proprietary) |
| Anthropic Messages | — | — | — | — | — |
| OpenAI Responses | — | — | — | — | — |
| Letta `.af` (Agent File) | — | — | — | — | snapshot-only |
| W3C VC Data Integrity | ✓ generic | — | ✓ generic | — | — |

`agent-scroll` is the only library shaping a conversation as a chain of canonically-encoded, individually-signable turns.

---

## In the `agent-*` family

`agent-scroll` is one of eight open-source primitives for self-custody AI-agent infrastructure. Cross-references:

- **Optionally depends on** [`agent-id`](../agent-id/) — DIDs and capability VCs for signer identity. `sig.pubkey` is a base64 Ed25519 key today; in v0.2 the field will accept a DID and the verifier will resolve it.
- **Depended on by** [`agent-rerun`](../agent-rerun/) — its `expected.transcript_sha256` is computed over scroll-canonical bytes.
- **Composable with** [`agent-toolprint`](../agent-toolprint/) — toolprint receipts can attach by ID to scroll turns' `tool_calls[]`.

Detail: [docs/interop.md](./docs/interop.md).

---

## Documentation

| Doc | Purpose |
|---|---|
| [SPEC.md](./SPEC.md) | Normative v1.0 specification — encoding, schema, sealing, verify, conformance |
| [docs/getting-started.md](./docs/getting-started.md) | Install through your first signed scroll, ~5 minutes |
| [docs/concepts.md](./docs/concepts.md) | Turn, SealedTurn, Scroll, hash chain, redaction, signature scope |
| [docs/api.md](./docs/api.md) | Full API reference — every exported function and type |
| [docs/integrations.md](./docs/integrations.md) | Capture from Anthropic Messages today; OpenAI / Google planned in v0.2 |
| [docs/interop.md](./docs/interop.md) | Using scroll alongside `agent-id`, `agent-rerun`, `agent-toolprint` |
| [docs/threat-model.md](./docs/threat-model.md) | What scroll protects against, what it deliberately doesn't |
| [conformance/README.md](./conformance/README.md) | Implementer's guide — running the conformance bar against your library |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | How to file issues, send PRs, and propose spec changes |
| [CHANGELOG.md](./CHANGELOG.md) | Per-release notes |

---

## Tech stack

- **Runtime:** [Bun](https://bun.sh) — single binary, native TS, native SQLite, native WebSocket
- **Crypto:** [`@noble/ed25519`](https://github.com/paulmillr/noble-ed25519) + [`@noble/hashes`](https://github.com/paulmillr/noble-hashes) — audited, zero deps
- **Canonicalization:** [`canonicalize`](https://www.npmjs.com/package/canonicalize) — RFC 8785 JCS
- **Schema:** [Zod](https://zod.dev) — runtime + types
- **Lint / format:** [Biome](https://biomejs.dev) — one tool, zero config wars

Total runtime dependencies: **4**. Transitive node_modules size: ~3 MB.

---

## Project status

- **v0.1.0 — released 2026-04-25.** Spec frozen at v1.0.
- 42 tests, lint clean, single-binary build, full conformance suite.
- See [CHANGELOG.md](./CHANGELOG.md) for what landed and what's deferred to v0.2.

---

## Roadmap (v0.2 and beyond)

- **OpenAI Responses → Turn** mapping (recipe in `examples/`).
- **Google AI `generate-content` → Turn** mapping.
- **Deterministic CBOR** encoding (RFC 8949 §4.2) as opt-in alternative to JCS.
- **DID resolver integration** so `sig.pubkey` can be a `did:key` / `did:web` and verify resolves it.
- **Replay-window verifier policy** — `verify` accepts a `maxAgeMs` option.

Each is purely additive — no breaking changes to v1.0.

---

## License

Apache 2.0 — see [LICENSE](./LICENSE).

## Research and prior art

Landscape, prior art, scoring rationale: [`../research/`](../research/) and especially [`../research/validations/agent-scroll.md`](../research/validations/agent-scroll.md).
