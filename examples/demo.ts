import * as ed from "@noble/ed25519";
import { canonical, sealChain, verify } from "../src/index";
import type { Turn } from "../src/schema";

const privkey = ed.utils.randomPrivateKey();
const pubkey = await ed.getPublicKeyAsync(privkey);

const turns: Turn[] = [
  {
    version: "scroll/0.1",
    turn: 0,
    role: "user",
    model: { vendor: "demo", id: "human" },
    params: { temperature: 0, top_p: 1 },
    messages: [{ role: "user", content: "hello" }],
    timestamp_ns: 0,
  },
  {
    version: "scroll/0.1",
    turn: 1,
    role: "assistant",
    model: { vendor: "anthropic", id: "claude-sonnet-4-5" },
    params: { temperature: 0.7, top_p: 1 },
    messages: [{ role: "assistant", content: "hi back" }],
    timestamp_ns: 1,
  },
];

const sealed = await sealChain(turns, { privkey, pubkey });

console.log("canonical turn 0:", new TextDecoder().decode(canonical(sealed[0])));

const ok = await verify(sealed, pubkey);
console.log("verify ok:", ok.ok);

const tampered = JSON.parse(JSON.stringify(sealed));
tampered[1].messages[0].content = "NOT what was said";
const bad = await verify(tampered, pubkey);
console.log(
  "after tamper:",
  bad.ok
    ? "OK (BUG!)"
    : `caught: ${(bad as { failures: { reason: string }[] }).failures[0]?.reason}`,
);
