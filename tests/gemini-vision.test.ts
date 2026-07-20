import { describe, expect, it, vi, beforeEach } from "vitest";
import { z } from "zod";
import { generate } from "../src/core/generate.js";
import { gemini } from "../src/backends/gemini.js";
import type { ImageContent } from "../src/types.js";

const generateContent = vi.fn().mockResolvedValue({ text: '{"name":"Alice"}' });

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent, generateContentStream: vi.fn() };
  },
}));

const schema = z.object({ name: z.string() });
const base64Image: ImageContent = { data: "aGVsbG8=", mimeType: "image/jpeg" };
const urlImage: ImageContent = { url: "https://example.com/receipt.jpg" };

describe("gemini() image wiring", () => {
  beforeEach(() => generateContent.mockClear());

  it("builds a contents array with inlineData for a base64 image", async () => {
    await generate(gemini({ apiKey: "test" }), schema, "extract this", { images: [base64Image] });

    const call = generateContent.mock.calls[0][0];
    expect(call.contents).toEqual([
      {
        role: "user",
        parts: [{ text: expect.any(String) }, { inlineData: { mimeType: "image/jpeg", data: "aGVsbG8=" } }],
      },
    ]);
  });

  it("throws a clear error for a URL-form image", async () => {
    await expect(generate(gemini({ apiKey: "test" }), schema, "extract this", { images: [urlImage] })).rejects.toThrow(
      /only accepts base64 images/
    );
  });

  it("sends a plain string contents when no images are passed", async () => {
    await generate(gemini({ apiKey: "test" }), schema, "extract this");

    const call = generateContent.mock.calls[0][0];
    expect(typeof call.contents).toBe("string");
  });
});
