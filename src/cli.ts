#!/usr/bin/env node
import { readFileSync } from "fs";
import { checkJsonSchema } from "./core/validate.js";

function usage(): never {
  console.error("Usage: shapecraft validate --schema <schema.json> --output <output.json>");
  process.exit(1);
}

function readJson(flag: string, path: string): Record<string, unknown> {
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch {
    console.error(`Could not read ${flag} file: ${path}`);
    process.exit(1);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error(`${flag} file is not valid JSON: ${path}`);
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function parseArgs(argv: string[]): { schema: string; output: string } {
  let schema: string | undefined;
  let output: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--schema") schema = argv[++i];
    else if (argv[i] === "--output") output = argv[++i];
  }
  if (!schema || !output) usage();
  return { schema, output };
}

function runValidate(argv: string[]): void {
  const { schema: schemaPath, output: outputPath } = parseArgs(argv);
  const schema = readJson("--schema", schemaPath);
  const output = readJson("--output", outputPath);

  try {
    checkJsonSchema(output, schema);
  } catch (err) {
    console.error(`✗ ${outputPath} does not match ${schemaPath}`);
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  console.log(`✓ ${outputPath} matches ${schemaPath}`);
}

const [command, ...rest] = process.argv.slice(2);

if (command === "validate") {
  runValidate(rest);
} else {
  console.error("Usage: shapecraft validate --schema <schema.json> --output <output.json>");
  process.exit(1);
}
