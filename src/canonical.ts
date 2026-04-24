import canonicalize from "canonicalize";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

export function canonical(value: unknown): Uint8Array {
  const s = canonicalize(value);
  if (s === undefined) throw new Error("canonicalize: value not representable");
  return new TextEncoder().encode(s);
}

export function hashCanonical(value: unknown): string {
  return "sha256:" + bytesToHex(sha256(canonical(value)));
}
