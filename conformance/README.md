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
