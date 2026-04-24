import { hashCanonical } from "../src/canonical";
import type { Turn } from "../src/schema";

type AnthropicMessage = {
  role: "user" | "assistant" | "tool" | "system";
  content: string | Array<Record<string, unknown>>;
};

type Args = {
  messages: AnthropicMessage[];
  model: { vendor: string; id: string; fingerprint?: string };
  params: { temperature: number; top_p: number; seed?: number; max_tokens?: number };
  timestamp_ns_base: number;
};

export function fromAnthropic({ messages, model, params, timestamp_ns_base }: Args): Turn[] {
  return messages.map((m, i) => {
    const turn: Turn = {
      version: "scroll/0.1",
      turn: i,
      role: m.role,
      model,
      params,
      messages: [{ role: m.role, content: m.content }],
      timestamp_ns: timestamp_ns_base + i,
    };
    if (Array.isArray(m.content)) {
      const tool_calls = m.content
        .filter((b) => b.type === "tool_use")
        .map((b) => ({
          id: String(b.id),
          name: String(b.name),
          args_hash: hashCanonical(b.input),
          args: b.input,
        }));
      const tool_results = m.content
        .filter((b) => b.type === "tool_result")
        .map((b) => ({
          id: String(b.tool_use_id ?? b.id),
          status: (b.is_error ? "error" : "ok") as "ok" | "error",
          response_hash: hashCanonical(b.content),
          response: b.content,
        }));
      if (tool_calls.length) turn.tool_calls = tool_calls;
      if (tool_results.length) turn.tool_results = tool_results;
    }
    return turn;
  });
}
