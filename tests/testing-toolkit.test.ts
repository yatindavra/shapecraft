import { describe, it, expect } from "vitest";
import { z } from "zod";
import { generate } from "../src/core/generate.js";
import { generateStream } from "../src/core/stream.js";
import { mockModel, mockModelThatFails } from "../src/testing/index.js";
import { MaxRetriesExceededError, SchemaViolationError } from "../src/types.js";

const PersonSchema = z.object({ name: z.string(), age: z.number() });

describe("@aviasole/shapecraft/testing", () => {
  it("mockModel() with a single value returns it on every call", async () => {
    const model = mockModel({ name: "Alice", age: 30 });
    const first = await generate(model, PersonSchema, "extract data");
    const second = await generate(model, PersonSchema, "extract data");
    expect(first.data).toEqual({ name: "Alice", age: 30 });
    expect(second.data).toEqual({ name: "Alice", age: 30 });
  });

  it("mockModel() with an array of responses returns them in order, then holds the last", async () => {
    const model = mockModel([{ name: "A", age: 1 }, { name: "B", age: 2 }]);
    expect((await model.generate("x", PersonSchema)) as unknown).toEqual({ name: "A", age: 1 });
    expect((await model.generate("x", PersonSchema)) as unknown).toEqual({ name: "B", age: 2 });
    expect((await model.generate("x", PersonSchema)) as unknown).toEqual({ name: "B", age: 2 });
  });

  it("mockModel() throws an Error entry instead of returning it - fail once, then succeed on retry", async () => {
    const model = mockModel([new SchemaViolationError("bad", "invalid"), { name: "Alice", age: 30 }]);
    const result = await generate(model, PersonSchema, "extract data", { maxRetries: 2 });
    expect(result.data).toEqual({ name: "Alice", age: 30 });
    expect(result.attempts).toBe(2);
  });

  it("mockModelThatFails() always throws, exhausting retries with MaxRetriesExceededError", async () => {
    const model = mockModelThatFails();
    await expect(generate(model, PersonSchema, "extract data", { maxRetries: 2 })).rejects.toThrow(
      MaxRetriesExceededError
    );
  });

  it("supports generateStream() - the streamed text is the JSON-stringified response", async () => {
    const model = mockModel({ name: "Alice", age: 30 });
    const stream = generateStream(model, PersonSchema, "extract data");
    let text = "";
    for await (const chunk of stream.textStream) text += chunk;
    expect(JSON.parse(text)).toEqual({ name: "Alice", age: 30 });
    expect((await stream.result).data).toEqual({ name: "Alice", age: 30 });
  });

  it("chat() is unset by default, and can be enabled via options.chat", async () => {
    const withoutChat = mockModel({ name: "Alice", age: 30 });
    expect(withoutChat.chat).toBeUndefined();

    const withChat = mockModel({ name: "Alice", age: 30 }, { chat: async () => "a reply" });
    expect(await withChat.chat?.([{ role: "user", content: "hi" }])).toBe("a reply");
  });

  it("id/guaranteeLevel/capabilities are configurable and default sensibly", () => {
    const defaults = mockModel({ ok: true });
    expect(defaults.id).toBe("mock:test");
    expect(defaults.guaranteeLevel).toBe("constrained");
    expect(defaults.capabilities).toBeUndefined();

    const custom = mockModel(
      { ok: true },
      { id: "mock:custom", guaranteeLevel: "native", capabilities: { streaming: true, chat: false, structuredOutput: true, toolCalling: false, skillDispatch: true } }
    );
    expect(custom.id).toBe("mock:custom");
    expect(custom.guaranteeLevel).toBe("native");
    expect(custom.capabilities?.streaming).toBe(true);
  });
});
