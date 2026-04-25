# agent-scroll conformance suite

This directory **is the product** for anyone implementing `agent-scroll` in another language. Pass these tests and your library can interoperate with every other conforming implementation: same canonical bytes, same hashes, same signatures.

---

## What "conformance" means here

A conforming implementation MUST satisfy the four (Cn) clauses from [SPEC §7](../SPEC.md#7-conformance):

| | Property | What we check |
|---|---|---|
| **C1** | Byte equality | The canonical encoding of a fixed Turn matches a fixed hex string. |
| **C2** | Mutation detection | Any single-bit flip in the canonical bytes makes `verify` fail. |
| **C3** | Round-trip | `deserialize(serialize(x))` preserves every normative field. |
| **C4** | Chain integrity | Reordering turns or rewriting `prev_hash` makes `verify` fail. |

These are the **only** things v1.0 implementations are tested on. Everything else (Anthropic mapping, the CLI, etc.) is library-internal — different implementations can shape those however they like.

---

## Two ways to run conformance

This repo ships conformance in two equivalent forms so language-foreign implementations can pick whichever is easier to consume.

### 1. Programmatic suite (TypeScript)

The reference scripts in this directory each test one Cn clause and throw on failure.

```bash
bun conformance/runner.ts
# PASS  C1 — canonical byte equality  (3 ms)
# PASS  C2 — single-byte mutation detection  (35 ms)
# PASS  C3 — serialize/deserialize roundtrip  (8 ms)
# PASS  C4 — chain tamper / reorder detection  (32 ms)
# 4/4 vectors passed
```

Each Cn script is a single async function in `c<n>-*.ts`. They use the reference TypeScript implementation in `../src/`. **For implementations in other languages, this is just a port target** — translate the four scripts into your target language using your library's API.

### 2. Golden JSON vectors

For language-agnostic validation we ship 20 hand-crafted `SealedTurn[]` chains plus 20 single-byte mutation fixtures:

```
conformance/
├── vectors/
│   ├── 001-user-text-only.json
│   ├── 002-assistant-custom-params.json
│   ├── …
│   ├── 020-kitchen-sink.json
│   └── mutations/
│       ├── 001-user-text-only-tampered.json
│       └── …
└── fixtures/
    ├── c1-hex.json       # script-private input for C1 (not a vector)
    └── c1-turns.json     # script-private input for C1 (not a vector)
```

Your implementation MUST:

- **Accept** every file in `vectors/*.json` (`verify` returns ok).
- **Reject** every file in `vectors/mutations/*.json` (`verify` returns a failure — any of `BadHash`, `BrokenChain`, `BadSignature`, `SchemaViolation`).

Run that loop in your language and you've tested 80% of conformance without writing any vector logic yourself.

The reference TypeScript wires this loop through `bun:test`:

```bash
bun test tests/conformance.test.ts
# ✓ every base vector verifies
# ✓ every mutation is rejected
```

---

## Vector coverage

The 20 numbered vectors deliberately exercise every shape v1.0 supports:

| Vector | Scenario |
|---|---|
| 001 | user, text only, default params |
| 002 | assistant, custom temperature + top_p |
| 003 | assistant + sampling seed |
| 004 | assistant + max_tokens cap |
| 005 | user, content-as-array (block list) |
| 006 | system role |
| 007 | tool, response text |
| 008 | tool_call with args body inline |
| 009 | tool_call with args body redacted (hash only) |
| 010 | tool_result with response inline |
| 011 | tool_result with response redacted, status `error` |
| 012 | 3-turn chain, unsigned |
| 013 | 1 turn, signed (deterministic test key) |
| 014 | 2-turn chain, both signed |
| 015 | 1 turn, signed + redacted args |
| 016 | unicode content (emoji, RTL, combining marks) |
| 017 | long content (~10 KB string) |
| 018 | multiple tool_calls in one turn |
| 019 | multiple tool_results, mixed ok / error |
| 020 | kitchen sink (custom params + tools + sig) |

The mutation fixtures are produced mechanically from the base vectors — see [`../tools/gen-mutations.ts`](../tools/gen-mutations.ts) for the algorithm. Each base vector has exactly one mutation pair.

---

## Submitting a new conforming implementation

1. Implement against [SPEC.md](../SPEC.md). Pay disproportionate attention to §2 (encoding) and §3.2 (redaction at write time).
2. Translate the four `c<n>-*.ts` scripts into your language. They're <60 lines each.
3. Wire the JSON-vector loop: load each `vectors/*.json`, call `verify`, expect ok; load each `vectors/mutations/*.json`, call `verify`, expect failure.
4. Open a PR adding your implementation under "## Implementations" in the top-level README.

We don't run other implementations in CI — that's an honour system, but the vectors are the receipt.

---

## Reference test key

All signed vectors (013, 014, 015, 020) use a deterministic test key:

```
private key: 0x0101010101010101010101010101010101010101010101010101010101010101 (32 bytes of 0x01)
public  key: derived via Ed25519 from the private key
```

Don't use this key in production. It's a known value so vectors stay reproducible.

---

## Running against the reference implementation

```bash
bun install
bun conformance/runner.ts        # C1–C4 programmatic suite
bun test tests/conformance.test.ts  # vector-loop suite
```

Both should pass in under one second.
