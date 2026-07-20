import { describe, expect, it, vi, beforeEach } from "vitest";
import { z } from "zod";
import { generate } from "../src/core/generate.js";
import { anthropic } from "../src/backends/anthropic.js";
import type { ImageContent } from "../src/types.js";

const capture = vi.fn().mockResolvedValue({ content: [{ type: "text", text: '{"name":"Alice"}' }] });

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: capture, stream: vi.fn() };
  },
}));

const schema = z.object({ name: z.string() });
const base64Image: ImageContent = { data: "aGVsbG8=", mimeType: "image/jpeg" };
const urlImage: ImageContent = { url: "https://example.com/receipt.jpg" };

describe("anthropic() image wiring", () => {
  beforeEach(() => capture.mockClear());

  it("builds a base64 image content block", async () => {
    await generate(anthropic({ apiKey: "test" }), schema, "extract this", { images: [base64Image] });

    const call = capture.mock.calls[0][0];
    expect(call.messages[0].content).toEqual([
      { type: "text", text: expect.any(String) },
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "aGVsbG8=" } },
    ]);
  });

  it("builds a URL image content block", async () => {
    await generate(anthropic({ apiKey: "test" }), schema, "extract this", { images: [urlImage] });

    const call = capture.mock.calls[0][0];
    expect(call.messages[0].content).toEqual([
      { type: "text", text: expect.any(String) },
      { type: "image", source: { type: "url", url: "https://example.com/receipt.jpg" } },
    ]);
  });

  it("sends a plain string user message when no images are passed", async () => {
    await generate(anthropic({ apiKey: "test" }), schema, "extract this");

    const call = capture.mock.calls[0][0];
    expect(typeof call.messages[0].content).toBe("string");
  });
});
