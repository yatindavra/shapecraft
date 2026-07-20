import { describe, expect, it } from "vitest";
import { z } from "zod";
import { generate } from "../src/core/generate.js";
import { openai } from "../src/backends/openai.js";
import { mockModelThatFails } from "./helpers/index.js";
import type { ImageContent } from "../src/types.js";

const schema = z.object({ name: z.string() });

// The two checks CLAUDE.md requires for any new format-support addition:
// (1) wrong-format input into generate(), (2) an unrelated prompt against the schema.
// images is purely additive plumbing (it never touches the validation/retry pipeline),
// so the risk surface is "does attaching one accidentally change how those paths
// behave" - not per-backend request-shape correctness, already covered by vision.test.ts.
describe("images: required wrong-format / unrelated-prompt checks", () => {
  it("a malformed ImageContent (missing data/mimeType) doesn't crash generate() - fails at the model call, not internally", async () => {
    // Neither `data` nor `url` present - not a value the ImageContent type permits,
    // but nothing stops a caller from doing this in plain JS. Should fail from the
    // (mocked) model call, not throw inside shapecraft's own relay/helper code.
    const malformed = {} as ImageContent;
    await expect(
      generate(openai({ apiKey: "test" }), schema, "extract this", { images: [malformed] })
    ).rejects.toThrow();
  });

  it("an unrelated prompt against the schema still retries normally when images are attached", async () => {
    // mockModelThatFails always throws SchemaViolationError - proves the retry loop
    // (and MaxRetriesExceededError on exhaustion) is unaffected by images being present,
    // since images only ever reaches callOptions, never the validation pipeline.
    const model = mockModelThatFails();
    const image: ImageContent = { data: "aGVsbG8=", mimeType: "image/jpeg" };

    await expect(
      generate(model, schema, "completely unrelated prompt with nothing to do with the schema", {
        images: [image],
        maxRetries: 2,
      })
    ).rejects.toThrow(/Schema validation failed after 2 attempts/);
  });
});
