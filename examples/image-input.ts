/**
 * Example: image input — attaching an image alongside the text prompt for
 * vision-capable models.
 *
 * `images` is orthogonal to `schema` — the schema still describes the output
 * shape, images are just extra input content the model looks at while
 * producing it, the same category of thing `systemPrompt` is.
 */
import { z } from "zod";
import { generate, anthropic, gemini } from "@aviasole/shapecraft";
import { readFileSync } from "node:fs";

const receiptSchema = z.object({
  vendor: z.string(),
  total: z.number(),
  lineItems: z.array(z.object({ description: z.string(), price: z.number() })),
});

// ── URL form — some backends (openai/groq/fireworks/mistral/openRouter/
// deepseek/anthropic) fetch the image server-side, no local file needed. ────
const fromUrl = await generate(anthropic(), receiptSchema, "Extract this receipt", {
  images: [{ url: "https://example.com/receipt.jpg" }],
});
console.log(fromUrl.data);

// ── Base64 form — works everywhere in-scope, including gemini()/ollama(),
// which throw on a { url } image since neither API has a URL-fetch source
// type. Encode the file yourself and pass the bytes directly. ──────────────
const photo = readFileSync("./receipt.jpg").toString("base64");
const fromFile = await generate(gemini(), receiptSchema, "Extract this receipt", {
  images: [{ data: photo, mimeType: "image/jpeg" }],
});
console.log(fromFile.data);

// ── Multiple images in one call — e.g. a multi-page invoice. ────────────────
const page2 = readFileSync("./receipt-page-2.jpg").toString("base64");
await generate(gemini(), receiptSchema, "Extract this receipt (2 pages)", {
  images: [
    { data: photo, mimeType: "image/jpeg" },
    { data: page2, mimeType: "image/jpeg" },
  ],
});
