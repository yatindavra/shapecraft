import { describe, expect, it, vi, beforeEach } from "vitest";
import { z } from "zod";
import { userContentFor } from "../src/core/vision.js";
import { generate } from "../src/core/generate.js";
import { openai } from "../src/backends/openai.js";
import { groq } from "../src/backends/groq.js";
import { fireworks } from "../src/backends/fireworks.js";
import { mistral } from "../src/backends/mistral.js";
import { openRouter } from "../src/backends/openRouter.js";
import { deepseek } from "../src/backends/deepseek.js";
import type { ImageContent, ShapecraftModel } from "../src/types.js";

const capture = vi.fn().mockResolvedValue({ choices: [{ message: { content: '{"name":"Alice"}' } }] });

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: capture } };
  },
}));

vi.mock("groq-sdk", () => ({
  default: class {
    chat = { completions: { create: capture } };
  },
}));

const schema = z.object({ name: z.string() });
const base64Image: ImageContent = { data: "aGVsbG8=", mimeType: "image/jpeg" };
const urlImage: ImageContent = { url: "https://example.com/receipt.jpg" };

describe("userContentFor", () => {
  it("returns plain text when no images are given", () => {
    expect(userContentFor("hello")).toBe("hello");
  });

  it("returns plain text for an empty images array", () => {
    expect(userContentFor("hello", [])).toBe("hello");
  });

  it("builds a content array with a base64 image as a data URI", () => {
    expect(userContentFor("hello", [base64Image])).toEqual([
      { type: "text", text: "hello" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,aGVsbG8=" } },
    ]);
  });

  it("builds a content array with a URL image unchanged", () => {
    expect(userContentFor("hello", [urlImage])).toEqual([
      { type: "text", text: "hello" },
      { type: "image_url", image_url: { url: "https://example.com/receipt.jpg" } },
    ]);
  });

  it("supports multiple images", () => {
    const result = userContentFor("hello", [urlImage, base64Image]);
    expect(result).toHaveLength(3);
  });
});

describe("Group A backends relay images into the user message content", () => {
  beforeEach(() => capture.mockClear());

  const backends: Array<[string, () => ShapecraftModel]> = [
    ["openai", () => openai({ apiKey: "test" })],
    ["groq", () => groq({ apiKey: "test" })],
    ["fireworks", () => fireworks({ apiKey: "test" })],
    ["mistral", () => mistral({ apiKey: "test" })],
    ["openRouter", () => openRouter({ apiKey: "test" })],
    ["deepseek", () => deepseek({ apiKey: "test" })],
  ];

  it.each(backends)("%s builds a multimodal user message when images are passed", async (_name, makeModel) => {
    await generate(makeModel(), schema, "extract this", { images: [base64Image] });

    const call = capture.mock.calls[0][0];
    const userMessage = call.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).toEqual([
      { type: "text", text: expect.any(String) },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,aGVsbG8=" } },
    ]);
  });

  it.each(backends)("%s sends a plain string user message when no images are passed", async (_name, makeModel) => {
    await generate(makeModel(), schema, "extract this");

    const call = capture.mock.calls[0][0];
    const userMessage = call.messages.find((m: { role: string }) => m.role === "user");
    expect(typeof userMessage.content).toBe("string");
  });
});
