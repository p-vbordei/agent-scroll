#!/usr/bin/env bun
import * as ed from "@noble/ed25519";
import { z } from "zod";
import { Turn } from "../src/schema";
import { sealChain } from "../src/seal";

const text = await Bun.stdin.text();
const input = JSON.parse(text);
const turns = z.array(Turn).parse(input.turns ?? input);
let sign: { privkey: Uint8Array; pubkey: Uint8Array } | undefined;
if (input.key_hex) {
  const privkey = Uint8Array.from(Buffer.from(input.key_hex.padEnd(64, "0"), "hex"));
  const pubkey = await ed.getPublicKeyAsync(privkey);
  sign = { privkey, pubkey };
}
const chain = await sealChain(turns, sign);
process.stdout.write(JSON.stringify(chain, null, 2));
