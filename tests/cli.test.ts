import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "child_process";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const CLI = join(__dirname, "..", "src", "cli.ts");

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("npx", ["tsx", CLI, ...args], { encoding: "utf-8", shell: true });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const PersonSchema = {
  type: "object",
  required: ["name", "age"],
  properties: {
    name: { type: "string" },
    age: { type: "number" },
  },
};

describe("CLI - shapecraft validate", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "shapecraft-cli-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("exits 0 and prints a checkmark when output matches schema", () => {
    const schemaPath = join(dir, "schema.json");
    const outputPath = join(dir, "output.json");
    writeFileSync(schemaPath, JSON.stringify(PersonSchema));
    writeFileSync(outputPath, JSON.stringify({ name: "Jane Doe", age: 34 }));

    const { status, stdout } = runCli(["validate", "--schema", schemaPath, "--output", outputPath]);
    expect(status).toBe(0);
    expect(stdout).toContain("✓");
    expect(stdout).toContain("matches");
  }, 20_000);

  it("exits 1 and reports the specific violation when output is missing a required field", () => {
    const schemaPath = join(dir, "schema.json");
    const outputPath = join(dir, "output.json");
    writeFileSync(schemaPath, JSON.stringify(PersonSchema));
    writeFileSync(outputPath, JSON.stringify({ name: "Jane Doe" }));

    const { status, stderr } = runCli(["validate", "--schema", schemaPath, "--output", outputPath]);
    expect(status).toBe(1);
    expect(stderr).toContain("does not match");
    expect(stderr).toContain('Missing required property: "age"');
  }, 20_000);

  it("exits 1 with a clear message when the output file doesn't exist", () => {
    const schemaPath = join(dir, "schema.json");
    writeFileSync(schemaPath, JSON.stringify(PersonSchema));

    const { status, stderr } = runCli(["validate", "--schema", schemaPath, "--output", join(dir, "missing.json")]);
    expect(status).toBe(1);
    expect(stderr).toContain("Could not read --output file");
  }, 20_000);

  it("exits 1 with a clear message when the schema file is not valid JSON", () => {
    const schemaPath = join(dir, "schema.json");
    const outputPath = join(dir, "output.json");
    writeFileSync(schemaPath, "{ not valid json");
    writeFileSync(outputPath, JSON.stringify({ name: "Jane Doe", age: 34 }));

    const { status, stderr } = runCli(["validate", "--schema", schemaPath, "--output", outputPath]);
    expect(status).toBe(1);
    expect(stderr).toContain("--schema file is not valid JSON");
  }, 20_000);

  it("exits 1 with usage when --output is omitted", () => {
    const schemaPath = join(dir, "schema.json");
    writeFileSync(schemaPath, JSON.stringify(PersonSchema));

    const { status, stderr } = runCli(["validate", "--schema", schemaPath]);
    expect(status).toBe(1);
    expect(stderr).toContain("Usage: shapecraft validate");
  }, 20_000);

  it("exits 1 with usage for an unknown command", () => {
    const { status, stderr } = runCli(["frobnicate"]);
    expect(status).toBe(1);
    expect(stderr).toContain("Usage: shapecraft validate");
  }, 20_000);
});
