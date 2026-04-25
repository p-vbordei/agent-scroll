# Interop

How `agent-scroll` fits into the broader `agent-*` family of primitives. Each integration is described at the level of v0.1; forward-looking v0.2 plans are noted where relevant.

---

## `agent-id`

`agent-id` manages decentralized identities (DIDs) and capability VCs for agents and operators.

In v0.1, `sig.pubkey` is a base64-encoded raw Ed25519 public key (32 bytes). In v0.2, the field will accept a `did:key` or `did:web` DID URI, and `verify` will resolve the DID document to obtain the key.

For now, if your agent identity is managed by `agent-id`, extract the raw public key bytes from the DID and pass them to `seal`:

```typescript
import * as ed from "@noble/ed25519";
import { seal } from "./src/index";
import type { Turn } from "./src/index";

// Your agent-id keypair — load from secure storage, not hardcoded.
const privkey: Uint8Array = loadPrivkeyFromAgentId();
const pubkey = await ed.getPublicKeyAsync(privkey);

const turn: Turn = {
  version: "scroll/0.1",
  turn: 0,
  role: "assistant",
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  params: { temperature: 1, top_p: 1 },
  messages: [{ role: "assistant", content: "Task complete." }],
  timestamp_ns: Date.now() * 1_000_000,
};

// sig.pubkey will be base64(pubkey) — store it alongside the scroll
// so verifiers can call verify(chain, pubkey).
const sealed = await seal(turn, { privkey, pubkey });
```

When v0.2 DID support lands, the `seal` API will accept `{ did: string }` in addition to `{ privkey, pubkey }`, and `verify` will resolve and cache the public key automatically.

---

## `agent-rerun`

`agent-rerun` provides reproducibility receipts for agent runs. Its `expected.transcript_sha256` field is computed over the scroll-canonical bytes of the full sealed chain.

To produce the value that `agent-rerun` expects, serialize the entire chain to a single byte sequence and hash it:

```typescript
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { canonical, sealChain } from "./src/index";
import type { Turn } from "./src/index";

const turns: Turn[] = [/* ... */];
const chain = await sealChain(turns);

// Serialize the chain as a JSON array using canonical encoding.
const chainBytes = canonical(chain);
const transcriptHash = `sha256:${bytesToHex(sha256(chainBytes))}`;

// Store in your agent-rerun receipt.
const receipt = {
  run_id: "run_abc123",
  expected: {
    transcript_sha256: transcriptHash,
    model: "claude-opus-4-7",
    seed: 42,
  },
};
```

Two replays with the same model, seed, and inputs produce byte-identical scrolls, so `transcript_sha256` is a stable replay anchor.

---

## `agent-toolprint`

`agent-toolprint` issues receipts for tool invocations — provenance records proving that a specific tool was called with specific inputs and produced a specific output.

A toolprint receipt attaches to a scroll turn by `id`. The `tool_calls[].id` in a `Turn` is the link:

```typescript
import { hashCanonical } from "./src/index";
import type { Turn } from "./src/index";

// The id matches the toolprint receipt's invocation_id.
const turn: Turn = {
  version: "scroll/0.1",
  turn: 1,
  role: "assistant",
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  params: { temperature: 1, top_p: 1 },
  messages: [{ role: "assistant", content: "Running search." }],
  tool_calls: [
    {
      id: "toolprint_receipt_id_abc",  // links to the toolprint receipt
      name: "web_search",
      args_hash: hashCanonical({ query: "agent-scroll" }),
      args: { query: "agent-scroll" },
    },
  ],
  timestamp_ns: 1_700_000_000_000_000_000,
};
```

The scroll hash-chains the tool call; the toolprint receipt independently proves the invocation. A verifier can cross-reference the two using `tool_calls[].id`.

---

## `agent-cid`

`agent-cid` generates content-addressed identifiers (CIDs) for large artifacts: images, documents, audio. Including a large artifact inline in a turn would bloat the scroll and break canonical encoding for blob data.

The correct pattern: store the artifact separately, put its CID in the message content, and let scroll hash the CID string.

```typescript
import type { Turn } from "./src/index";

// The artifact lives in IPFS or your CID store.
// The turn references it by CID — scroll hashes the CID, not the artifact.
const turn: Turn = {
  version: "scroll/0.1",
  turn: 2,
  role: "user",
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  params: { temperature: 0, top_p: 1 },
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "Describe this image." },
        { type: "cid_ref", cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi" },
      ],
    },
  ],
  timestamp_ns: 1_700_000_000_000_000_000,
};
```

The CID is part of the canonical bytes. If someone swaps the artifact at the CID store, the CID in the scroll still matches the original — `verify` passes, but out-of-band CID verification of the artifact itself will catch the swap.

---

## `agent-phone`

`agent-phone` handles on-the-wire communication between agents: request routing, protocol negotiation, message delivery.

When an agent receives a request over `agent-phone` and produces a response, sealing the resulting turn creates on-the-wire proof of exactly what the agent said:

```typescript
import { seal } from "./src/index";
import type { Turn } from "./src/index";

// Called after receiving an agent-phone request and producing a response.
async function sealPhoneTurn(
  requestContent: string,
  responseContent: string,
  privkey: Uint8Array,
  pubkey: Uint8Array,
  turnIndex: number,
  prevHash?: string,
): Promise<ReturnType<typeof seal>> {
  const turn: Turn = {
    version: "scroll/0.1",
    turn: turnIndex,
    role: "assistant",
    model: { vendor: "anthropic", id: "claude-opus-4-7" },
    params: { temperature: 1, top_p: 1 },
    messages: [
      { role: "user", content: requestContent },
      { role: "assistant", content: responseContent },
    ],
    timestamp_ns: Date.now() * 1_000_000,
    ...(prevHash ? { prev_hash: prevHash } : {}),
  };
  return seal(turn, { privkey, pubkey });
}
```

The signed sealed turn is portable evidence of the agent's output — useful for dispute resolution if a downstream party claims the agent said something different.

---

## `agent-ask`

`agent-ask` handles Q&A flows: routing questions to the right agent and returning answers.

A Q&A exchange maps naturally to a 2-turn scroll: the question is turn 0 (role `"user"`), the answer is turn 1 (role `"assistant"`). Sealing the pair gives you a replay-ready, tamper-evident receipt of the exchange:

```typescript
import { sealChain } from "./src/index";
import type { Turn } from "./src/index";

const question: Turn = {
  version: "scroll/0.1",
  turn: 0,
  role: "user",
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  params: { temperature: 0, top_p: 1 },
  messages: [{ role: "user", content: "What is the capital of France?" }],
  timestamp_ns: 1_700_000_000_000_000_000,
};

const answer: Turn = {
  version: "scroll/0.1",
  turn: 1,
  role: "assistant",
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  params: { temperature: 0, top_p: 1 },
  messages: [{ role: "assistant", content: "Paris." }],
  timestamp_ns: 1_700_000_000_000_000_001,
};

const receipt = await sealChain([question, answer]);
// Store receipt alongside agent-ask's answer index for replay.
```

---

## `agent-pay`

`agent-pay` manages payments in agent workflows, including L402 challenge/response flows and paid API calls.

Payment-related turns often need audit trails: an L402 `401 WWW-Authenticate` challenge, the payment proof, and the subsequent paid response form a three-turn scroll that is evidence of the full transaction.

```typescript
import { sealChain } from "./src/index";
import type { Turn } from "./src/index";

const challenge: Turn = {
  version: "scroll/0.1",
  turn: 0,
  role: "tool",
  model: { vendor: "agent-pay", id: "l402-gate" },
  params: { temperature: 0, top_p: 1 },
  messages: [
    {
      role: "tool",
      content: "401 WWW-Authenticate: L402 macaroon=..., invoice=lnbc...",
    },
  ],
  timestamp_ns: 1_700_000_000_000_000_000,
};

const payment: Turn = {
  version: "scroll/0.1",
  turn: 1,
  role: "user",
  model: { vendor: "agent-pay", id: "l402-client" },
  params: { temperature: 0, top_p: 1 },
  messages: [{ role: "user", content: "Authorization: L402 macaroon=...:preimage=..." }],
  timestamp_ns: 1_700_000_000_000_000_001,
};

const paidResponse: Turn = {
  version: "scroll/0.1",
  turn: 2,
  role: "assistant",
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  params: { temperature: 1, top_p: 1 },
  messages: [{ role: "assistant", content: "Access granted. Here is the premium content." }],
  timestamp_ns: 1_700_000_000_000_000_002,
};

// The sealed chain is an audit trail: challenge → payment → paid response.
const auditTrail = await sealChain([challenge, payment, paidResponse]);
```

The sealed chain is tamper-evident: if anyone alters the payment proof or the response after the fact, `verify` will report `BadHash` or `BrokenChain`.
