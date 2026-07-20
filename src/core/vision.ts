import type { ImageContent } from "../types.js";

/**
 * Builds an OpenAI-compatible multimodal `content` array - shared by every backend
 * that reaches its API via the `openai` package pointed at a different `baseURL`
 * (openai, groq, fireworks, mistral, openRouter, deepseek). Returns the plain text
 * unchanged when no images are attached, so callers without images see no shape
 * change. `image_url.url` accepts both a real URL and a `data:<mimeType>;base64,<data>`
 * URI, so both `ImageContent` forms map onto the same field.
 */
export function userContentFor(text: string, images?: ImageContent[]): string | Record<string, unknown>[] {
  if (!images || images.length === 0) return text;

  return [
    { type: "text", text },
    ...images.map((img) => ({
      type: "image_url",
      image_url: { url: "url" in img ? img.url : `data:${img.mimeType};base64,${img.data}` },
    })),
  ];
}
