# Contributing to agent-scroll

Thanks for considering a contribution. The bar for changes here is high because **this repo is a format**: any change to canonical encoding, hashing, or signing semantics breaks every existing scroll. Please read this file before opening a PR.

## Quick orientation

- **The spec is the source of truth.** Implementation drifts from spec are bugs in the implementation.
- **Conformance vectors are the contract** other implementations validate against. Don't modify a vector unless you also bump the spec major version.
- **Tests are TDD.** New behavior gets a failing test first, then the implementation.
- **One logical change per PR.** Easier to review, easier to revert.

## Local dev

```bash
bun install
bun test                       # all tests
bun run lint                   # biome check
bun examples/demo.ts           # smoke the demo
bun conformance/runner.ts      # smoke the C1–C4 conformance suite
bun run build                  # single-binary compile
```

If `bun test` is green, `bun run lint` is green, and the demo prints both `verify clean: ✓` and `verify tamper: ✓ caught`, your tree is healthy.

## Project layout

```
agent-scroll/
├── README.md
├── SPEC.md                   # normative spec (v1.0)
├── SCOPE.md                  # what's IN-V0.1 and what's deferred
├── CHANGELOG.md
├── package.json              # 4 runtime deps, no more
├── tsconfig.json             # strict mode + noUncheckedIndexedAccess
├── biome.json                # one-stop lint/format config
├── src/                      # the library — flat, ≤200 lines per file
│   ├── schema.ts             # Zod schemas, types
│   ├── canonical.ts          # JCS encode + sha256
│   ├── seal.ts               # seal, sealChain
│   ├── verify.ts             # verify
│   ├── cli.ts                # scroll canon | seal | verify
│   └── index.ts              # public barrel
├── tests/                    # bun:test
├── examples/
│   ├── demo.ts               # the 20-line value-prop demo
│   ├── conversation.json     # — (deferred; demo currently inlines turns)
│   └── from-anthropic.ts     # vendor recipe
├── conformance/              # the conformance bar (THIS IS THE PRODUCT)
│   ├── README.md             # implementer's guide
│   ├── runner.ts             # entry point
│   ├── c1-byte-equality.ts   # C1 — JCS byte-equality
│   ├── c2-mutation.ts        # C2 — single-byte mutation detection
│   ├── c3-roundtrip.ts       # C3 — serialize/deserialize roundtrip
│   ├── c4-chain-tamper.ts    # C4 — chain tamper / reorder
│   ├── fixtures/             # script-private inputs (not vectors)
│   └── vectors/              # 20 golden JSON vectors + 20 mutation fixtures
├── tools/                    # authoring helpers (not part of the public API)
│   ├── gen-vector.ts
│   └── gen-mutations.ts
├── docs/                     # narrative documentation
└── .github/workflows/ci.yml
```

## What kind of contributions are we looking for?

### Welcome

- **Bug reports** — especially anything where `bun run conformance` produces output that disagrees with another implementation.
- **Implementation in another language** (Rust, Go, Python, …) — submit a link in your PR; we'll add it to the README.
- **New vendor mappings** in `examples/from-<vendor>.ts` — recipes only, no tight coupling to the core library.
- **Documentation polish** — typo fixes, clearer examples, better diagrams.
- **Spec ambiguities** — open an issue with a concrete failing case and a proposed clarification.

### Send a discussion first

- **New normative behavior in the spec.** v1.0 is frozen; additions go through v1.1 / v2.0 with a discussion issue first.
- **New runtime dependencies.** v0.1 has four. Adding a fifth needs a justification.
- **New top-level files.** Repo layout is intentionally flat.

### Probably not

- Refactors that don't change behavior.
- "Fixing" the line count of `examples/demo.ts` to drop further than the current 26 (Biome owns its formatting).
- Adding a build step beyond `bun build --compile`.

## TDD discipline

Every behavior change follows this pattern:

1. Write a failing test that captures the desired behavior. Run it; see it fail.
2. Write the smallest implementation that makes the test pass.
3. Run the full test suite (`bun test`) — confirm nothing else broke.
4. Run `bun run lint`. Apply auto-fixes if any.
5. Commit with a focused message. Format: `feat(area): what — why if non-obvious`.

If you're tempted to write code without a test, the change probably belongs in `docs/` or `examples/` rather than `src/`.

## Spec changes

Edits to `SPEC.md` MUST come with:

1. A reason in the PR description.
2. A version bump (`§Status` line) — patch for clarifications, minor for additive features, major for incompatible changes.
3. New conformance vectors / mutation fixtures if the change is observable.

Major-version bumps to the spec require a separate `vN/` directory with both the old and new vectors so old implementations remain conformant against `v1` while new implementations are tested against `v2`.

## Filing issues

A good issue includes:

- The smallest possible repro (a Turn JSON + the command you ran).
- The actual output.
- The expected output.
- Your `bun --version`, OS, and architecture.

For interop bugs (mismatched bytes against another implementation), include both implementations' output as hex (`xxd` or `od -A x -t x1z -v`).

## Code of conduct

Be kind. Disagree on substance, not on style. We optimise for "happy maintainers and happy contributors" — if a discussion is going off the rails, take a break and come back.

## License

By contributing, you agree your work is licensed under [Apache 2.0](./LICENSE).
