# Changelog

## v0.1.0 — 2026-04-25

Initial release. Reference TypeScript + Bun implementation of the agent-scroll v1.0 specification.

### Added
- SPEC v1.0: canonical JCS encoding, turn schema (`version`, `turn`, `role`, `model`, `params`, `messages`, `tool_calls?`, `tool_results?`, `timestamp_ns`, `prev_hash?`), SHA-256 hash chain, optional Ed25519 signature per turn, conformance clauses C1–C4.
- Public API: `serialize`, `deserialize`, `canonical`, `hashCanonical`, `seal`, `sealChain`, `verify`. Plus types `Turn`, `SealedTurn`, `Sig`, `VerifyResult`.
- `VerifyResult` discriminated union: `BadHash`, `BrokenChain`, `BadSignature`, `SchemaViolation`.
- Hash-only redaction (SPEC §3.2): writers may omit `args` / `response` plaintext bodies; the `args_hash` / `response_hash` fields still bind the content.
- Anthropic Messages → Turn[] recipe (`examples/from-anthropic.ts`).
- 20-line demo (`examples/demo.ts`).
- Conformance suite (`bun conformance/runner.ts`): C1 byte-equality, C2 mutation, C3 roundtrip, C4 chain-tamper.
- CLI (`scroll canon` / `scroll seal` / `scroll verify`).

### Deferred to v0.2
- Vendor mappings for OpenAI Responses and Google AI generate-content.
- Deterministic CBOR (RFC 8949 §4.2) encoding.
- Replay-window verifier policy.
- DID resolver integration for `sig.pubkey` field.

### Non-goals
- Streaming mid-turn serialization.
- Algorithm agility (SPEC pins SHA-256 + Ed25519).
- Storage layer / SQLite / viewer UI.
- Multi-signature per turn (use `agent-toolprint` for double-sig).
