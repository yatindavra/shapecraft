import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/fhir/index.ts", "src/cli.ts", "src/testing/index.ts"],
  format: ["esm", "cjs"],
  dts: false,
  sourcemap: true,
  clean: true,
  splitting: true,
  treeshake: true,
  external: ["zod", "zod-to-json-schema"],
});
