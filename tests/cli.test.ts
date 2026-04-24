import { test, expect } from "bun:test";

const cli = "src/cli.ts";

async function run(args: string[], stdin?: string): Promise<{ stdout: string; stderr: string; code: number }> {
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
