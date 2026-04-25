import { z } from "zod";

const HashStr = z.string().regex(/^sha256:[0-9a-f]{64}$/);

const Model = z.object({
  vendor: z.string().min(1),
  id: z.string().min(1),
  fingerprint: z.string().optional(),
});

const Params = z.object({
  temperature: z.number(),
  top_p: z.number(),
  seed: z.number().int().optional(),
  max_tokens: z.number().int().optional(),
});

const Message = z.object({
  role: z.string(),
  content: z.union([z.string(), z.array(z.unknown())]),
});

const ToolCall = z.object({
  id: z.string(),
  name: z.string(),
  args_hash: HashStr,
  args: z.unknown().optional(),
});

const ToolResult = z.object({
  id: z.string(),
  status: z.enum(["ok", "error"]),
  response_hash: HashStr,
  response: z.unknown().optional(),
});

export const Turn = z.object({
  version: z.literal("scroll/0.1"),
  turn: z.number().int().nonnegative(),
  role: z.enum(["user", "assistant", "tool", "system"]),
  model: Model,
  params: Params,
  messages: z.array(Message),
  tool_calls: z.array(ToolCall).optional(),
  tool_results: z.array(ToolResult).optional(),
  timestamp_ns: z.number().int().nonnegative(),
  prev_hash: HashStr.optional(),
});
export type Turn = z.infer<typeof Turn>;

export const Sig = z.object({
  alg: z.literal("ed25519"),
  pubkey: z.string(),
  sig: z.string(),
});
export type Sig = z.infer<typeof Sig>;

export const SealedTurn = Turn.extend({
  hash: HashStr,
  sig: Sig.optional(),
});
export type SealedTurn = z.infer<typeof SealedTurn>;

export type VerifyFailure =
  | { turn: number; reason: "BadHash" }
  | { turn: number; reason: "BrokenChain" }
  | { turn: number; reason: "BadSignature" }
  | { turn: number; reason: "SchemaViolation"; detail: string };

export type VerifyResult = { ok: true } | { ok: false; failures: VerifyFailure[] };
