import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { generate } from "../src/core/generate.js";
import { ollama } from "../src/backends/ollama.js";
import type { ImageContent } from "../src/types.js";

const schema = z.object({ name: z.string() });
const base64Image: ImageContent = { data: "aGVsbG8=", mimeType: "image/jpeg" };
const urlImage: ImageContent = { url: "https://example.com/receipt.jpg" };

function mockFetchOk() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ message: { content: '{"name":"Alice"}' } }),
  });
}

describe("ollama() image wiring", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetchOk());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("adds a base64 images array to the user message", async () => {
    await generate(ollama({ model: "llava" }), schema, "extract this", { images: [base64Image] });

    const call = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(call[1]?.body as string);
    const userMessage = body.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.images).toEqual(["aGVsbG8="]);
    expect(userMessage.content).toEqual(expect.any(String));
  });

  it("omits images from the user message when none are passed", async () => {
    await generate(ollama({ model: "llava" }), schema, "extract this");

    const call = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(call[1]?.body as string);
    const userMessage = body.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.images).toBeUndefined();
  });

  it("throws a clear error for a URL-form image", async () => {
    await expect(generate(ollama({ model: "llava" }), schema, "extract this", { images: [urlImage] })).rejects.toThrow(
      /only accepts base64 images/
    );
  });
});
