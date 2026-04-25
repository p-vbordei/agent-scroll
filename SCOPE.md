# SCOPE — agent-scroll v0.1.0

Output of Stage 1 (scope compression). Default verdict is DEFERRED.
Inclusion in v0.1 requires either a real first-party caller TODAY, or the primary use case dying without it.

## IN-V0.1

FEATURE: JCS canonical encoding (RFC 8785)
- Real first-party caller in the family? YES — agent-rerun's `expected.transcript_sha256` is computed over scroll-canonical bytes.
- Primary use case dies without it? YES — byte-determinism IS the product.
- Reinvents an existing mature primitive? NO — uses the `canonicalize` npm package.
VERDICT: IN-V0.1

FEATURE: Turn schema (Zod-validated)
- Real first-party caller in the family? YES — every consumer needs the data shape.
- Primary use case dies without it? YES — schema IS the contract.
- Reinvents an existing mature primitive? NO — Zod for the parser.
VERDICT: IN-V0.1

FEATURE: Anthropic Messages → Turn (single recipe in `examples/from-anthropic.ts`)
- Real first-party caller in the family? Indirect — the demo dies without one concrete vendor mapping.
- Primary use case dies without it? Demo loses its punch. SPEC §3.1 originally listed three mappings; v0.1 ships one.
- Reinvents an existing mature primitive? NO.
VERDICT: IN-V0.1 — as a single inline recipe, NOT a "vendor framework" abstraction.

FEATURE: Sealing — SHA-256(canonical(turn)) + prev_hash chain
- Real first-party caller in the family? YES — agent-rerun consumes per-turn hashes.
- Primary use case dies without it? YES — without chain, scrolls aren't tamper-evident.
- Reinvents an existing mature primitive? NO — `@noble/hashes/sha256`.
VERDICT: IN-V0.1

FEATURE: Ed25519 signing (per-turn `sig`, optional)
- Real first-party caller in the family? agent-id signers and agent-toolprint countersigners can sign scroll turns.
- Primary use case dies without it? Partially — chain is tamper-evident but not attributable; "legal evidence" pitch dies.
- Reinvents an existing mature primitive? NO — `@noble/ed25519`.
VERDICT: IN-V0.1

FEATURE: Public API — `serialize` / `deserialize` / `seal` / `verify`
- Real first-party caller in the family? YES — every consumer.
- Primary use case dies without it? YES — these ARE the product surface.
- Reinvents an existing mature primitive? NO.
VERDICT: IN-V0.1 (all four)

FEATURE: `VerifyResult` discriminated union (`BadHash` / `BrokenChain` / `BadSignature` / `SchemaViolation`)
- Real first-party caller in the family? YES — callers act differently per failure mode.
- Primary use case dies without it? Partially — boolean would work but burns user time.
- Reinvents an existing mature primitive? NO — ~10 LoC discriminated union.
VERDICT: IN-V0.1

FEATURE: Hash-only redaction (`args_hash`/`response_hash` mandatory; bodies optional)
- Real first-party caller in the family? Tools emitting PII; agent-toolprint already hashes args/response separately.
- Primary use case dies without it? NO, but cost is near zero — schema lets the body be omittable; hash is canonical.
- Reinvents an existing mature primitive? NO.
VERDICT: IN-V0.1 (SPEC §3.2 added to clarify write-time semantics)

FEATURE: Conformance vectors (≥20 hand-crafted SealedTurns) + mutation fixtures
- Real first-party caller in the family? YES — every other implementation that ships.
- Primary use case dies without it? YES — per philosophy: "Conformance IS the product."
- Reinvents an existing mature primitive? N/A.
VERDICT: IN-V0.1

FEATURE: Demo CLI (`scroll canon`, `scroll seal`, `scroll verify`) + 20-line `examples/demo.ts`
- Real first-party caller in the family? YES — used by `examples/demo.ts`.
- Primary use case dies without it? YES — format repos sell themselves through one command.
- Reinvents an existing mature primitive? NO — Bun's built-in arg handling.
VERDICT: IN-V0.1

## DEFERRED-TO-V0.2

FEATURE: Deterministic CBOR encoding (RFC 8949 §4.2)
- No first-party consumer; nothing in family reads CBOR scrolls.
- JCS does the job for v0.1.
VERDICT: DEFERRED-TO-V0.2

FEATURE: Vendor normalization — OpenAI Responses → Turn
- Demo only needs one mapping; OpenAI added in v0.2.
VERDICT: DEFERRED-TO-V0.2

FEATURE: Vendor normalization — Google AI generate-content → Turn
- Same as OpenAI.
VERDICT: DEFERRED-TO-V0.2

FEATURE: Replay-window verifier policy on `timestamp_ns`
- Caller can compare timestamps themselves; not a library concern.
VERDICT: DEFERRED-TO-V0.2

FEATURE: DID resolver integration for signers
- `verify(chain, pubkey)` is sufficient; the caller decodes their DID.
VERDICT: DEFERRED-TO-V0.2

## CUT (will not ship in any near-term version)

FEATURE: Streaming mid-turn serialization
- README explicit out-of-scope.
VERDICT: CUT

FEATURE: Hash / signature algorithm agility
- SPEC pins SHA-256 + Ed25519. No reason to generalize speculatively.
VERDICT: CUT

FEATURE: Storage layer / SQLite / viewer UI
- "One problem, done absurdly well." This is a format library.
VERDICT: CUT

FEATURE: Multi-signature per turn
- Not in v0.1 SPEC; agent-toolprint covers double-sig already.
VERDICT: CUT

## SPEC amendments landed alongside this scope

1. **§3.1 (Vendor normalization)** narrowed: v0.1 ships Anthropic only; OpenAI + Google deferred to v0.2.
2. **§3.2 (Redaction at write time)** added: clarifies `args_hash`/`response_hash` are SHA-256 of canonical bodies, computed at write time; redaction is permanent and post-hoc stripping breaks the chain (intended).
