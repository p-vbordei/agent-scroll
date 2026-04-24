import { expect, test } from "bun:test";

const cli = "src/cli.ts";

async function run(
  args: string[],
  stdin?: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  const proc = Bun.spawn(["bun", "run", cli, ...args], {
    stdin: stdin !== undefined ? new TextEncoder().encode(stdin) : undefined,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const code = await proc.exited;
  return { stdout, stderr, code };
}

test("scroll canon emits JCS bytes for stdin JSON", async () => {
  const r = await run(["canon"], '{"b":1,"a":2}');
  expect(r.code).toBe(0);
  expect(r.stdout).toBe('{"a":2,"b":1}');
});

test("scroll (no args) prints usage and exits 1", async () => {
  const r = await run([]);
  expect(r.code).toBe(1);
  expect(r.stderr).toContain("usage:");
});

test("scroll seal --key <hex> seals an unsealed Turn[] from stdin", async () => {
  const turn = {
    version: "scroll/0.1",
    turn: 0,
    role: "user",
    model: { vendor: "anthropic", id: "claude-opus-4-7" },
    params: { temperature: 0, top_p: 1 },
    messages: [{ role: "user", content: "hi" }],
    timestamp_ns: 1_700_000_000_000_000_000,
  };
  const key = "00".repeat(32); // deterministic test key
  const r = await run(["seal", "--key", key], JSON.stringify([turn]));
  expect(r.code).toBe(0);
  const parsed = JSON.parse(r.stdout);
  expect(parsed).toHaveLength(1);
  expect(parsed[0]).toHaveProperty("hash");
  expect(parsed[0]).toHaveProperty("sig.alg", "ed25519");
});

test("scroll seal (no key) emits unsigned SealedTurn[]", async () => {
  const turn = {
    version: "scroll/0.1",
    turn: 0,
    role: "user",
    model: { vendor: "anthropic", id: "claude-opus-4-7" },
    params: { temperature: 0, top_p: 1 },
    messages: [{ role: "user", content: "hi" }],
    timestamp_ns: 1_700_000_000_000_000_000,
  };
  const r = await run(["seal"], JSON.stringify([turn]));
  expect(r.code).toBe(0);
  const parsed = JSON.parse(r.stdout);
  expect(parsed[0]).toHaveProperty("hash");
  expect(parsed[0].sig).toBeUndefined();
});

test("scroll verify exits 0 on a valid sealed chain", async () => {
  const turn = {
    version: "scroll/0.1",
    turn: 0,
    role: "user",
    model: { vendor: "anthropic", id: "claude-opus-4-7" },
    params: { temperature: 0, top_p: 1 },
    messages: [{ role: "user", content: "hi" }],
    timestamp_ns: 1_700_000_000_000_000_000,
  };
  const sealed = await run(["seal"], JSON.stringify([turn]));
  const v = await run(["verify"], sealed.stdout);
  expect(v.code).toBe(0);
});

test("scroll verify exits 1 and prints failures on a tampered chain", async () => {
  const turn = {
    version: "scroll/0.1",
    turn: 0,
    role: "user",
    model: { vendor: "anthropic", id: "claude-opus-4-7" },
    params: { temperature: 0, top_p: 1 },
    messages: [{ role: "user", content: "hi" }],
    timestamp_ns: 1_700_000_000_000_000_000,
  };
  const sealed = await run(["seal"], JSON.stringify([turn]));
  const tampered = sealed.stdout.replace(`"hi"`, `"HI"`);
  const v = await run(["verify"], tampered);
  expect(v.code).toBe(1);
  expect(v.stderr).toContain("BadHash");
});
