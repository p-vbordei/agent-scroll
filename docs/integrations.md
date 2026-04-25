# Integrations

How to capture real conversations from LLM providers and convert them to `Turn[]` for sealing.

---

## Anthropic Messages

`examples/from-anthropic.ts` is the v0.1 normative mapping. It accepts an array of Anthropic `Message` objects plus metadata and returns `Turn[]`.

### Text-only conversation

```typescript
import { fromAnthropic } from "./examples/from-anthropic";
import { sealChain, verify } from "./src/index";

const messages = [
  { role: "user" as const, content: "What is the boiling point of water?" },
  { role: "assistant" as const, content: "100°C at standard pressure." },
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

Each message maps to one `Turn`. The `turn` index and `timestamp_ns` are derived from position and `timestamp_ns_base`.

### Tool-use conversation

When a message's `content` is an array of blocks, `from-anthropic.ts` inspects each block:

- `type === "tool_use"` blocks become `tool_calls` entries. `args_hash` is computed from `b.input`.
- `type === "tool_result"` blocks become `tool_results` entries. `response_hash` is computed from `b.content`.

```typescript
import { hashCanonical } from "./src/index";
import { fromAnthropic } from "./examples/from-anthropic";
import { sealChain, verify } from "./src/index";

const messages = [
  { role: "user" as const, content: "Look up user 42." },
  {
    role: "assistant" as const,
    content: [
      {
        type: "tool_use",
        id: "tu_abc",
        name: "lookup_user",
        input: { user_id: 42 },
      },
    ],
  },
  {
    role: "tool" as const,
    content: [
      {
        type: "tool_result",
        tool_use_id: "tu_abc",
        content: { name: "Alice", email: "alice@example.com" },
        is_error: false,
      },
    ],
  },
  { role: "assistant" as const, content: "The user is Alice." },
];

const turns = fromAnthropic({
  messages,
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  params: { temperature: 1, top_p: 1 },
  timestamp_ns_base: 1_700_000_000_000_000_000,
});

const chain = await sealChain(turns);
const result = await verify(chain);
console.log(result.ok); // true
```

If you want to redact tool args or results, omit the `args` / `response` fields and keep only the hashes. See [docs/concepts.md — Redaction at write time](./concepts.md#redaction-at-write-time).

### Function signature

```typescript
function fromAnthropic(args: {
  messages: AnthropicMessage[];
  model: { vendor: string; id: string; fingerprint?: string };
  params: { temperature: number; top_p: number; seed?: number; max_tokens?: number };
  timestamp_ns_base: number;
}): Turn[]
```

Source: [`examples/from-anthropic.ts`](../examples/from-anthropic.ts).

---

## OpenAI Responses (v0.2)

v0.1 does not ship an OpenAI Responses mapping. The planned migration in v0.2 looks like this:

OpenAI Responses returns `output` items. Each item with `type === "function_call"` maps to a `tool_calls` entry; each `type === "function_call_output"` maps to a `tool_results` entry, matched by `call_id`. Text output items map to `messages`.

The function signature will follow the same pattern as `fromAnthropic`:

```typescript
// planned for v0.2 — not yet implemented
function fromOpenAI(args: {
  messages: OpenAIMessage[];
  outputItems: OpenAIOutputItem[];
  model: { vendor: "openai"; id: string };
  params: { temperature: number; top_p: number; seed?: number; max_tokens?: number };
  timestamp_ns_base: number;
}): Turn[]
```

Until v0.2, write your own normalizer (see [Custom vendors](#custom-vendors) below).

---

## Google AI generate-content (v0.2)

v0.1 does not ship a Google AI mapping. The planned migration in v0.2 will normalize `generateContent` request/response pairs. Google's `Content[]` objects use `parts` arrays; `FunctionCall` parts map to `tool_calls`, `FunctionResponse` parts map to `tool_results`.

```typescript
// planned for v0.2 — not yet implemented
function fromGoogleAI(args: {
  request: GenerateContentRequest;
  response: GenerateContentResponse;
  model: { vendor: "google"; id: string };
  params: { temperature: number; top_p: number };
  timestamp_ns_base: number;
}): Turn[]
```

Until v0.2, write your own normalizer.

---

## Custom vendors

Writing your own normalizer is straightforward. Model `examples/from-anthropic.ts` directly — it is the canonical example.

A normalizer is a pure function with this shape:

```typescript
import { hashCanonical } from "./src/index";
import type { Turn } from "./src/index";

type YourVendorMessage = {
  role: "user" | "assistant" | "system";
  content: string | YourBlock[];
};

export function fromYourVendor(args: {
  messages: YourVendorMessage[];
  model: { vendor: string; id: string; fingerprint?: string };
  params: { temperature: number; top_p: number; seed?: number; max_tokens?: number };
  timestamp_ns_base: number;
}): Turn[] {
  return args.messages.map((m, i) => {
    const turn: Turn = {
      version: "scroll/0.1",
      turn: i,
      role: m.role,
      model: args.model,
      params: args.params,
      messages: [{ role: m.role, content: m.content as string }],
      timestamp_ns: args.timestamp_ns_base + i,
    };
    // Extract tool calls and results from m.content if it's an array.
    // Use hashCanonical(args_body) for args_hash,
    // hashCanonical(response_body) for response_hash.
    return turn;
  });
}
```

Place the file in `examples/from-<vendor>.ts`. The output is `Turn[]` — hand it to `sealChain` and the rest of the library doesn't care where the data came from.

---

## Streaming

Streaming is out of scope for v0.1. Do not attempt to seal mid-stream turns.

The correct approach: let the stream complete, collect the full request and response, build one `Turn` from the complete content, then call `seal`. A turn represents a complete exchange — request plus response — not a partial one.

---

## What about the system prompt?

System prompts go in a `Turn` with `role: "system"`. Place it as turn 0 and let subsequent turns chain from it.

Conformance vector 006 (`conformance/vectors/006-system-role.json`) demonstrates this pattern. An example:

```typescript
import { sealChain } from "./src/index";
import type { Turn } from "./src/index";

const systemTurn: Turn = {
  version: "scroll/0.1",
  turn: 0,
  role: "system",
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  params: { temperature: 0, top_p: 1 },
  messages: [{ role: "system", content: "You are a helpful assistant." }],
  timestamp_ns: 1_700_000_000_000_000_000,
};

const userTurn: Turn = {
  version: "scroll/0.1",
  turn: 1,
  role: "user",
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  params: { temperature: 0, top_p: 1 },
  messages: [{ role: "user", content: "Hello." }],
  timestamp_ns: 1_700_000_000_000_000_001,
};

const chain = await sealChain([systemTurn, userTurn]);
// chain[1].prev_hash === chain[0].hash
```

The system turn is sealed and linked into the chain like any other turn, which means it is tamper-evident: any post-hoc change to the system prompt breaks `chain[1].prev_hash`.
