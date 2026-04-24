#!/usr/bin/env bun
import { canonical } from "./canonical";

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

async function sealCmd(_args: string[]): Promise<number> {
  process.stderr.write("seal: not implemented yet\n");
  return 1;
}

async function verifyCmd(_args: string[]): Promise<number> {
  process.stderr.write("verify: not implemented yet\n");
  return 1;
}

process.exit(await main());
