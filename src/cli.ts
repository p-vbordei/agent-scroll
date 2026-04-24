#!/usr/bin/env bun
import { canonical } from "./canonical";
import * as ed from "@noble/ed25519";
import { sealChain } from "./seal";
import { Turn } from "./schema";
import { z } from "zod";
import { verify } from "./verify";

const USAGE = `usage: scroll <canon | seal | verify> [flags]

  canon              read JSON on stdin, write canonical (JCS) bytes to stdout
  seal --key <hex>   read Turn[] JSON on stdin, write SealedTurn[] JSON to stdout
  verify [--pubkey <hex>]
                     read SealedTurn[] JSON on stdin, exit 0 if valid else 1
`;

async function main(): Promise<number> {
  const [cmd, ...rest] = Bun.argv.slice(2);
  switch (cmd) {
    case "canon":
      return canonCmd();
    case "seal":
      return await sealCmd(rest);
    case "verify":
      return await verifyCmd(rest);
    default:
      process.stderr.write(USAGE);
      return 1;
  }
}

async function canonCmd(): Promise<number> {
  const text = await Bun.stdin.text();
  const value = JSON.parse(text);
  process.stdout.write(canonical(value));
  return 0;
}

async function sealCmd(args: string[]): Promise<number> {
  const keyHex = flag(args, "--key");
  const text = await Bun.stdin.text();
  const turns = z.array(Turn).parse(JSON.parse(text));
  let sign: { privkey: Uint8Array; pubkey: Uint8Array } | undefined;
  if (keyHex) {
    const privkey = hexToBytes(keyHex);
    const pubkey = await ed.getPublicKeyAsync(privkey);
    sign = { privkey, pubkey };
  }
  const chain = await sealChain(turns, sign);
  process.stdout.write(JSON.stringify(chain));
  return 0;
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("hex string must have even length");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function verifyCmd(args: string[]): Promise<number> {
  const pubkeyHex = flag(args, "--pubkey");
  const text = await Bun.stdin.text();
  const chain = JSON.parse(text);
  const pubkey = pubkeyHex ? hexToBytes(pubkeyHex) : undefined;
  const result = await verify(chain, pubkey);
  if (result.ok) {
    process.stdout.write("ok\n");
    return 0;
  }
  for (const f of result.failures) {
    process.stderr.write(
      `turn ${f.turn}: ${f.reason}${"detail" in f ? ` (${f.detail})` : ""}\n`,
    );
  }
  return 1;
}

process.exit(await main());
