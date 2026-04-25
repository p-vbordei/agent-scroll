# agent-scroll — v0.1 specification

**Status:** 1.0 — released 2026-04-25.

## Abstract

`agent-scroll` defines a canonical, byte-deterministic, hash-chained serialization of an AI-agent conversation. Two independent implementations fed the same conversation produce byte-identical output.

## 1. Terminology

- **Turn** — a single exchange in the conversation: one request and its response (which may include tool calls + results).
- **Sealed turn** — a turn serialized canonically, hashed, optionally signed, and linked to the previous turn via `prev_hash`.
- **Scroll** — an ordered sequence of sealed turns forming a complete (or partial) conversation.

## 2. Encoding

Implementations MUST support:

- **JCS** ([RFC 8785](https://www.rfc-editor.org/rfc/rfc8785)) — JSON Canonicalization Scheme. Default encoding.

Implementations MAY support:

- **Deterministic CBOR** ([RFC 8949 §4.2](https://datatracker.ietf.org/doc/html/rfc8949)) — opt-in for binary / compact representation.

Floats SHOULD be avoided; where unavoidable, use IEEE 754 double with JCS number formatting. Integers are preferred (e.g. `timestamp_ns` instead of `timestamp_s`).

## 3. Turn schema

```
{
  "version": "scroll/0.1",
  "turn": <uint>,
  "role": "user" | "assistant" | "tool" | "system",
  "model": { "vendor": "...", "id": "...", "fingerprint?": "..." },
  "params": {
    "temperature": <number>,
    "top_p": <number>,
    "seed?": <int>,
    "max_tokens?": <int>
  },
  "messages": [{ "role": "...", "content": "..." | [...] }],
  "tool_calls?": [{ "id": "...", "name": "...", "args_hash": "sha256:...", "args?": {...} }],
  "tool_results?": [{ "id": "...", "status": "ok"|"error", "response_hash": "sha256:...", "response?": {...} }],
  "timestamp_ns": <uint>,
  "prev_hash?": "sha256:..."        // omitted in turn 0
}
```

### 3.1 Vendor normalization

Vendor-specific message shapes MUST be normalized into the schema above before hashing. v0.1 of this specification provides one normative mapping — Anthropic Messages, in `examples/from-anthropic.ts`. OpenAI Responses and Google AI `generate-content` mappings will be added in v0.2. Implementations are free to author additional mappings; doing so does not affect canonical encoding.

### 3.2 Redaction at write time

`args_hash` MUST be SHA-256 of the canonical encoding (per §2) of `args`; `response_hash` is similarly SHA-256 of canonical(`response`). The decision to include the plaintext body is made by the writer at turn-construction time:

- If a body is omitted, only its hash appears in the canonical bytes.
- If a body is present, both the body and its hash appear in the canonical bytes.

Either choice is valid, but it is permanent: once the turn is sealed, stripping the plaintext body changes the canonical bytes and breaks the chain hash. Late-stage redaction is not supported and is detectable as a chain break — this is intended.

## 4. Sealing

A `SealedTurn` is a turn plus:

```
{
  "hash": "sha256:<hex>",           // sha256 of canonical(turn) bytes
  "sig?": { "alg": "ed25519", "pubkey": "...", "sig": "..." }
}
```

Signing is optional but RECOMMENDED for turns authored by a verifiable party (e.g. an agent holding an `agent-id` DID).

The `sig.sig` value MUST be the Ed25519 signature over the canonical encoding (per §2) of the turn with `hash` and `sig` fields removed — i.e. over exactly the same bytes used to compute `hash`. Verifiers MUST recompute these bytes from the parsed turn rather than trusting any cached canonical form.

## 5. API (reference)

```
serialize(turn) -> bytes
deserialize(bytes) -> turn
seal(turn, prev_hash, signing_key?) -> SealedTurn
verify(chain: SealedTurn[], pubkey?) -> VerifyResult
```

`VerifyResult` enumerates per-turn failures: `BadHash`, `BrokenChain`, `BadSignature`, `SchemaViolation`.

## 6. Security considerations

- **Tampering** any byte inside a turn MUST change its `hash`, breaking the chain on verify.
- **Private-content redaction**: tools emitting PII SHOULD hash-only (`args_hash`/`response_hash`) and omit the plaintext body. The hash still binds the redacted content without exposing it.
- **Replay**: signed turns include `timestamp_ns`; verifiers MAY reject turns older than a configured window.
- **Clock skew**: `timestamp_ns` is informational, not used for validity windows inside the transcript itself.

## 7. Conformance

A conforming implementation MUST:

- (C1) Given the same turn, produce byte-identical canonical output as any other conforming implementation.
- (C2) Detect tampering: any single-byte mutation of the canonical encoding must cause `verify` to fail.
- (C3) Round-trip: `deserialize(serialize(x)) == x` across all normative fields.
- (C4) Chain integrity: re-ordering two turns or rewriting `prev_hash` must cause verification to fail.

Test vectors live in `conformance/` and include at minimum:

- 20 hand-crafted turns covering each role, tool calls, tool results, and vendor mappings.
- Mutation fixtures: single-byte edits that must all be caught.

## 8. References

- [RFC 8785 JCS](https://www.rfc-editor.org/rfc/rfc8785)
- [RFC 8949 CBOR](https://datatracker.ietf.org/doc/html/rfc8949)
- [W3C VC Data Integrity 1.0](https://www.w3.org/TR/vc-data-integrity/)
- [OpenTelemetry GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
