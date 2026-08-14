import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/fhir/index.ts", "src/agentic/index.ts", "src/cli.ts"],
  format: ["esm", "cjs"],
  dts: false,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  external: ["zod", "zod-to-json-schema"],
});
