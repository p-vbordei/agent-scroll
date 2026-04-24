# agent-scroll

> Canonical byte-deterministic transcript format for AI-agent conversations.

## What

`agent-scroll` is a vendor-neutral, byte-deterministic serialization of an agent conversation — every message, tool call, tool response, sampling parameter (temperature, top-p, seed), timestamp, and hash chain linking turns. Given the same conversation, two independent implementations produce **byte-identical** output.

Purpose: replay, audit, legal evidence, dispute resolution, reproducibility attestations. Any party holding a transcript plus a public key can verify it hasn't been altered.

## Status

**0.0 — design phase.** Draft spec in [SPEC.md](./SPEC.md). No code yet.

## The gap

Every vendor emits conversations in a different shape: Anthropic `tool_use`/`tool_result` blocks, OpenAI Responses `output` items with `call_id`, Google AI Studio proto-like records. Observability platforms (LangSmith, Langfuse, OTel GenAI) capture but do not canonicalize. W3C VC Data Integrity 1.0 provides the `transform → hash → sign` pipeline but no conversation schema. No canonical, vendor-neutral, byte-deterministic transcript format exists.

`agent-scroll` fills it.

## Scope

**In scope**

- Canonical schema for a conversation as a sequence of `SealedTurn`s
- Normative encoding (JCS RFC 8785 default; deterministic CBOR §4.2 opt-in)
- Hash-chain linkage (each turn includes `prev_hash`)
- Ed25519 signature per turn (optional but standard)
- Cross-impl conformance test vectors

**Out of scope**

- Observability / logs-as-a-service
- Replay execution (that's [`agent-rerun`](../agent-rerun/))
- UI / rendering
- Streaming serialization mid-turn

## Dependencies and companions

- **Depends on:** optionally `agent-id` (for DID-based signer identity).
- **Depended on by:** `agent-rerun` (the "expected" transcript is a scroll), potentially `agent-toolprint` (attaches tool receipts to scroll turns).

## Validation scoring

| Criterion | Score |
|---|---|
| Scope | 5 |
| Composes primitives | 5 |
| Standalone | 5 |
| Clear gap | 5 |
| Light deps | 4 |
| Testable | 5 |
| **Total** | **29/30** |

Verdict: **EASY**. Full validation: [`../research/validations/agent-scroll.md`](../research/validations/agent-scroll.md).

## Prior art

- **OTel GenAI semantic conventions** — observability, not canonical.
- **LangSmith RunTree, Langfuse** — proprietary / non-canonical captures.
- **Anthropic Messages, OpenAI Responses** — vendor-specific wire formats.
- **Letta Agent File (`.af`)** — agent state snapshot, not turn-by-turn.
- **W3C VC Data Integrity 1.0** — proof pipeline, no conversation layer.
- **JCS (RFC 8785), CBOR (RFC 8949 §4.2)** — canonicalization primitives, composable.

## Implementation skeleton

```
serialize(transcript) -> bytes            # JCS default; CBOR opt-in
deserialize(bytes) -> transcript
seal(transcript, prev_hash, signing_key) -> SealedTurn
verify(chain, pubkey) -> VerifyResult
```

**Schema (per turn):** `{role, model_id, params:{temperature, top_p, seed, max_tokens}, messages[], tool_calls[], tool_results[], timestamp_ns, prev_hash, hash, sig}`. Vendor-specific blocks normalized to one shape.

**Dependencies:** one JCS library (e.g. [`cyberphone/json-canonicalization`](https://github.com/cyberphone/json-canonicalization)) + standard library SHA-256 / Ed25519.

**Repo sizing:** ~1.5-2k LoC (Rust or Go reference), spec ~30-50 pages.

## Conformance tests

1. Two independent impls produce byte-identical output for the same transcript.
2. Key reordering, whitespace, and float-precision tweaks yield the same hash.
3. Tampering any byte breaks chain verification.
4. Round-trip `deserialize(serialize(x)) == x` preserves everything.

## License

Apache 2.0 — see [LICENSE](./LICENSE).

## Research

Landscape, prior art, scoring rationale: [`../research/`](../research/).
