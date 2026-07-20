import { describe, expect, it } from "vitest";
import { z } from "zod";
import { generate, generateStream } from "../src/index.js";
import type { ImageContent, ModelCallOptions, SchemaInput, ShapecraftModel } from "../src/types.js";

/** Records the `callOptions` it was invoked with, for asserting on relay behavior. */
function recordingMockModel(returnValue: unknown): ShapecraftModel & { lastCallOptions?: ModelCallOptions } {
  const model: ShapecraftModel & { lastCallOptions?: ModelCallOptions } = {
    id: "mock:test",
    guaranteeLevel: "constrained",
    async generate<T>(_p: string, _s: SchemaInput<T>, _sys?: string, callOptions?: ModelCallOptions): Promise<T> {
      model.lastCallOptions = callOptions;
      return returnValue as T;
    },
    async *generateStream<T>(_p: string, _s: SchemaInput<T>, _sys?: string, callOptions?: ModelCallOptions): AsyncIterable<string> {
      model.lastCallOptions = callOptions;
      yield JSON.stringify(returnValue);
    },
  };
  return model;
}

const schema = z.object({ name: z.string() });
const images: ImageContent[] = [{ data: "aGVsbG8=", mimeType: "image/jpeg" }];

describe("images relay", () => {
  it("generate() passes options.images through to the model's callOptions", async () => {
    const model = recordingMockModel({ name: "Alice" });
    await generate(model, schema, "extract", { images });
    expect(model.lastCallOptions?.images).toEqual(images);
  });

  it("generate() omits callOptions.images when none were passed", async () => {
    const model = recordingMockModel({ name: "Alice" });
    await generate(model, schema, "extract");
    expect(model.lastCallOptions?.images).toBeUndefined();
  });

  it("generateStream() passes options.images through to the model's callOptions", async () => {
    const model = recordingMockModel({ name: "Alice" });
    const handle = generateStream(model, schema, "extract", { images });
    await handle.result;
    expect(model.lastCallOptions?.images).toEqual(images);
  });

  it("generateStream() falls back to one-shot generate() and still relays images", async () => {
    const model = recordingMockModel({ name: "Alice" });
    delete model.generateStream;
    const handle = generateStream(model, schema, "extract", { images });
    await handle.result;
    expect(model.lastCallOptions?.images).toEqual(images);
  });
});
