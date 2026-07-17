import { z } from "zod";
import type { ChatMessage, ModelCallOptions, SchemaInput, ShapecraftModel } from "../types.js";
import { toJsonSchema, buildStructuredPrompt } from "../core/schema.js";
import { isZodSchema, isGbnfInput } from "../core/validate.js";
import { parseAndValidate } from "../core/parse.js";

export interface GrokBackendOptions {
  model?: string;
  apiKey?: string;
  baseURL?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function responseFormatFor(schema: SchemaInput): any {
  // No grammar mode - a gbnf input is prompt-only, best-effort, same as
  // openai()/groq()/mistral().
  if (isGbnfInput(schema)) return undefined;
  return isZodSchema(schema)
    ? {
        type: "json_schema" as const,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        json_schema: { name: "output", strict: true, schema: toJsonSchema(schema as z.ZodType<any>) },
      }
    : "jsonSchema" in (schema as object)
      ? {
          type: "json_schema" as const,
          json_schema: { name: "output", strict: false, schema: (schema as { jsonSchema: Record<string, unknown> }).jsonSchema },
        }
      : { type: "json_object" as const };
}

/**
 * xAI (Grok) - OpenAI-compatible chat completions API, reached via the `openai`
 * package pointed at xAI's base URL (same dependency `openai()`/`fireworks()`/
 * `mistral()` already use, no new SDK needed). Exported as `grok()` rather than
 * `xai()` - matches this repo's convention of naming after the product users
 * search for (`gemini()` not `google()`). `guaranteeLevel: "native"` -
 * `response_format: { type: "json_schema", ... }` is server-side enforced, same
 * tier as `openai()`/`groq()`/`fireworks()`/`mistral()`/`together()`/`cerebras()`.
 * No grammar mode - a `{ gbnf }` input is prompt-only, best-effort, same as every
 * other backend without one.
 */
export function grok(options: GrokBackendOptions = {}): ShapecraftModel {
  const modelId = options.model ?? "grok-4.5";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function client(): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import("openai").catch(() => {
      throw new Error("Install openai: npm install openai");
    });
    const OpenAI = mod.default ?? mod;
    const apiKey = options.apiKey ?? process.env.XAI_API_KEY;
    // The openai package falls back to reading OPENAI_API_KEY itself when apiKey
    // is undefined (not just omitted) - passing it through unchecked would silently
    // authenticate against xAI's endpoint with an unrelated OpenAI key instead of
    // failing clearly.
    if (!apiKey) throw new Error("Missing xAI API key: pass { apiKey } or set XAI_API_KEY");
    return new OpenAI({ apiKey, baseURL: options.baseURL ?? "https://api.x.ai/v1" });
  }

  return {
    id: `grok:${modelId}`,
    guaranteeLevel: "native",
    capabilities: { streaming: true, chat: true, structuredOutput: true, toolCalling: false, skillDispatch: true },

    async generate<T>(prompt: string, schema: SchemaInput<T>, systemPrompt?: string, callOptions?: ModelCallOptions): Promise<T> {
      const grokClient = await client();
      const { system, user } = buildStructuredPrompt(prompt, schema, systemPrompt);

      const response = await grokClient.chat.completions.create(
        {
          model: modelId,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: responseFormatFor(schema),
        },
        callOptions?.signal ? { signal: callOptions.signal } : undefined
      );

      const raw: string = response.choices[0]?.message?.content ?? "";

      return parseAndValidate<T>(raw, schema, { extractJson: true });
    },

    async chat(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
      const grokClient = await client();

      const response = await grokClient.chat.completions.create({
        model: modelId,
        messages: [
          ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      });

      return response.choices[0]?.message?.content ?? "";
    },

    async *generateStream<T>(
      prompt: string,
      schema: SchemaInput<T>,
      systemPrompt?: string,
      callOptions?: ModelCallOptions
    ): AsyncIterable<string> {
      const grokClient = await client();
      const { system, user } = buildStructuredPrompt(prompt, schema, systemPrompt);

      const stream = await grokClient.chat.completions.create(
        {
          model: modelId,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: responseFormatFor(schema),
          stream: true,
        },
        callOptions?.signal ? { signal: callOptions.signal } : undefined
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for await (const chunk of stream as AsyncIterable<any>) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      }
    },
  };
}
