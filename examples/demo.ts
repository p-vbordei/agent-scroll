import * as ed from "@noble/ed25519";
import { canonical, sealChain, verify } from "../src/index";
import type { Turn } from "../src/schema";
const privkey = ed.utils.randomPrivateKey();
const pubkey = await ed.getPublicKeyAsync(privkey);
const turn = (n: number, role: "user" | "assistant", content: string): Turn => ({
  version: "scroll/0.1",
  turn: n,
  role,
  model: { vendor: "demo", id: "v0" },
  params: { temperature: 0, top_p: 1 },
  messages: [{ role, content }],
  timestamp_ns: n,
});
const sealed = await sealChain([turn(0, "user", "hello"), turn(1, "assistant", "hi back")], {
  privkey,
  pubkey,
});
console.log(
  "canonical turn 0:",
  sealed[0] ? new TextDecoder().decode(canonical(sealed[0])) : "(empty)",
);
console.log("verify clean: ", (await verify(sealed, pubkey)).ok ? "✓" : "✗");
const tampered = JSON.parse(JSON.stringify(sealed));
tampered[1].messages[0].content = "NOT what was said";
console.log("verify tamper:", (await verify(tampered, pubkey)).ok ? "✗ (BUG)" : "✓ caught");
