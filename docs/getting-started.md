# Getting Started with agent-scroll

This guide takes you from a fresh machine to verifying signed scrolls in your own code. Expect about five minutes of reading and copy-pasting.

---

## Install Bun

agent-scroll is built with and for [Bun](https://bun.sh). Install it with:

```bash
curl -fsSL https://bun.sh/install | bash
```

Verify the install:

```bash
bun --version   # 1.x.x
```

Full installation options: [bun.sh/docs/installation](https://bun.sh/docs/installation).

---

## Get the library

agent-scroll is not yet published to npm. Clone and install locally:

```bash
git clone https://github.com/your-org/agent-scroll.git
cd agent-scroll
bun install
```

npm publish is forthcoming. Once available, `bun add agent-scroll` will work.

Run the sanity checks:

```bash
bun test                    # 42 tests, 0 failures
bun conformance/runner.ts   # C1–C4 conformance: 4/4 pass
```

---

## First seal-and-verify

The minimum unit of work: build one `Turn`, seal it, verify it.

```typescript
import { seal, verify } from "./src/index";
import type { Turn } from "./src/index";

// 1. Construct a Turn.
const turn: Turn = {
  version: "scroll/0.1",
  turn: 0,
  role: "user",
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  params: { temperature: 0, top_p: 1 },
  messages: [{ role: "user", content: "What is 2 + 2?" }],
  timestamp_ns: Date.now() * 1_000_000,
};

// 2. Seal it — computes sha256(canonical(turn)) and attaches as `hash`.
const sealed = await seal(turn);
console.log(sealed.hash); // sha256:<hex>

// 3. Verify — recomputes the hash and checks chain linkage.
const result = await verify([sealed]);
console.log(result.ok); // true
```

No keys, no config. `seal` produces a hash. `verify` confirms nothing was touched.

---

## Adding a signature

Signatures bind each turn to a keypair so verifiers can confirm who authored it. agent-scroll uses Ed25519 via [`@noble/ed25519`](https://github.com/paulmillr/noble-ed25519), which is already a dependency.

```typescript
import * as ed from "@noble/ed25519";
import { seal, verify } from "./src/index";
import type { Turn } from "./src/index";

// Generate a keypair. In production, load from a secure store.
const privkey = ed.utils.randomPrivateKey();
const pubkey = await ed.getPublicKeyAsync(privkey);

const turn: Turn = {
  version: "scroll/0.1",
  turn: 0,
  role: "assistant",
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  params: { temperature: 1, top_p: 1 },
  messages: [{ role: "assistant", content: "The answer is 4." }],
  timestamp_ns: Date.now() * 1_000_000,
};

// Seal with signing opts — attaches sig.alg, sig.pubkey, sig.sig.
const sealed = await seal(turn, { privkey, pubkey });

// Verify including signature check. Pass pubkey to enable it.
const result = await verify([sealed], pubkey);
console.log(result.ok); // true
```

`sig.pubkey` is the raw Ed25519 public key encoded as base64. In v0.2, `did:key` and `did:web` are planned ([SPEC §4](../SPEC.md)).

---

## Sealing a multi-turn chain

For real conversations you want `sealChain`, which automatically links each turn to the previous one via `prev_hash`.

```typescript
import * as ed from "@noble/ed25519";
import { sealChain, verify } from "./src/index";
import type { Turn } from "./src/index";

const privkey = ed.utils.randomPrivateKey();
const pubkey = await ed.getPublicKeyAsync(privkey);

const turns: Turn[] = [
  {
    version: "scroll/0.1",
    turn: 0,
    role: "user",
    model: { vendor: "anthropic", id: "claude-opus-4-7" },
    params: { temperature: 0, top_p: 1 },
    messages: [{ role: "user", content: "Hello." }],
    timestamp_ns: 1_700_000_000_000_000_000,
  },
  {
    version: "scroll/0.1",
    turn: 1,
    role: "assistant",
    model: { vendor: "anthropic", id: "claude-opus-4-7" },
    params: { temperature: 0, top_p: 1 },
    messages: [{ role: "assistant", content: "Hi there." }],
    timestamp_ns: 1_700_000_000_000_000_001,
  },
];

const chain = await sealChain(turns, { privkey, pubkey });
// chain[1].prev_hash === chain[0].hash

const result = await verify(chain, pubkey);
console.log(result.ok); // true
```

`sealChain` fills in `prev_hash` for you if the caller left it undefined. Turn 0 has no `prev_hash`; every subsequent turn's `prev_hash` points to the prior turn's `hash`.

---

## Capturing a real conversation

`examples/from-anthropic.ts` provides a ready-to-use normalizer that maps Anthropic Messages to `Turn[]`.

```typescript
import { fromAnthropic } from "./examples/from-anthropic";
import { sealChain, verify } from "./src/index";

// Messages as returned by the Anthropic SDK.
const messages = [
  { role: "user" as const, content: "Summarize this document." },
  { role: "assistant" as const, content: "Here is a summary..." },
];

const turns = fromAnthropic({
  messages,
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  params: { temperature: 1, top_p: 1 },
  timestamp_ns_base: Date.now() * 1_000_000,
});

const chain = await sealChain(turns);
const result = await verify(chain);
console.log(result.ok); // true
```

Tool-use conversations work the same way — `from-anthropic.ts` extracts `tool_use` blocks into `tool_calls` and `tool_result` blocks into `tool_results`. See [docs/integrations.md](./integrations.md) for details.

---

## Persisting a scroll

`serialize` encodes a `Turn` or `SealedTurn` to canonical JCS bytes (`Uint8Array`). Write those bytes wherever you store things — a file, a database column, IPFS, an S3 object.

```typescript
import { writeFile } from "node:fs/promises";
import { seal, serialize } from "./src/index";
import type { Turn } from "./src/index";

const turn: Turn = {
  version: "scroll/0.1",
  turn: 0,
  role: "user",
  model: { vendor: "demo", id: "v0" },
  params: { temperature: 0, top_p: 1 },
  messages: [{ role: "user", content: "persist me" }],
  timestamp_ns: 1_700_000_000_000_000_000,
};

const sealed = await seal(turn);
const bytes = serialize(sealed);

await writeFile("turn-0.json", bytes);
```

The bytes are valid UTF-8 JSON — `cat turn-0.json` is readable.

---

## Verifying a scroll on the way in

`deserialize` parses canonical bytes back into a `SealedTurn` (or `Turn`). Always run `verify` before trusting the data.

```typescript
import { readFile } from "node:fs/promises";
import { deserialize, verify } from "./src/index";

const bytes = await readFile("turn-0.json");
const sealed = deserialize(bytes);

const result = await verify([sealed]);
if (!result.ok) {
  for (const f of result.failures) {
    console.error(`turn ${f.turn}: ${f.reason}`);
  }
  process.exit(1);
}

// Safe to use.
console.log(sealed.messages[0]?.content);
```

To also verify signatures, pass a `Uint8Array` pubkey as the second argument to `verify`.

---

## Next steps

- **[docs/concepts.md](./concepts.md)** — build an accurate mental model of Turn, SealedTurn, canonical encoding, redaction, and the hash chain.
- **[docs/api.md](./api.md)** — full reference for every exported function and type.
- **[docs/integrations.md](./integrations.md)** — how to capture real conversations from Anthropic, and how to write your own vendor normalizer.
- **[conformance/README.md](../conformance/README.md)** — if you're implementing agent-scroll in another language, start here.
