import { describe, expect, it } from "vitest";
import { z } from "zod";
import { generate } from "../src/core/generate.js";
import { llamaCpp } from "../src/backends/llamaCpp.js";
import type { ImageContent } from "../src/types.js";

const schema = z.object({ name: z.string() });
const image: ImageContent = { data: "aGVsbG8=", mimeType: "image/jpeg" };

describe("llamaCpp() image rejection", () => {
  it("throws a clear error when images are passed, without loading the model", async () => {
    // No LLAMACPP_MODEL_PATH / node-llama-cpp needed - the rejection happens
    // before the model load, proving no attempt is made to use it.
    const model = llamaCpp({ modelPath: "/nonexistent/model.gguf" });

    await expect(generate(model, schema, "extract this", { images: [image] })).rejects.toThrow(
      /does not support image input/
    );
  });
});
