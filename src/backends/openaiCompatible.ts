import { z } from "zod";
import type { ChatMessage, GuaranteeLevel, ModelCallOptions, SchemaInput, ShapecraftModel } from "../types.js";
import { toJsonSchema, buildStructuredPrompt } from "../core/schema.js";
import { isZodSchema, isGbnfInput } from "../core/validate.js";
import { parseAndValidate } from "../core/parse.js";

export interface OpenAICompatibleBackendOptions {
  baseURL: string;
  apiKey: string;
  model: string;
  /**
   * Defaults to `"best-effort"` - shapecraft can't verify an arbitrary endpoint
   * actually enforces `response_format: json_schema` server-side. Pass `"native"`
   * explicitly only if you know your specific provider enforces it (same
   * mechanism `fireworks()`/`mistral()`/`together()`/`cerebras()`/`grok()` use).
   */
  guaranteeLevel?: GuaranteeLevel;
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
 * Generic escape hatch for any OpenAI-compatible chat completions endpoint that
 * doesn't have a dedicated backend - `baseURL`/`apiKey`/`model` are all supplied
 * by the caller instead of hardcoded per provider. Same request/response handling
 * `fireworks()`/`mistral()`/`together()`/`cerebras()`/`grok()` share.
 *
 * `apiKey` is required, not optional-with-an-env-fallback like the named
 * backends: there's no single conventional env var name for an arbitrary
 * provider, and the `openai` package silently falls back to reading
 * `OPENAI_API_KEY` itself when `apiKey` is `undefined` - so an unconfigured call
 * here would otherwise authenticate against a real OpenAI key against an
 * unrelated endpoint instead of failing clearly.
 */
export function openaiCompatible(options: OpenAICompatibleBackendOptions): ShapecraftModel {
  const modelId = options.model;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function client(): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import("openai").catch(() => {
      throw new Error("Install openai: npm install openai");
    });
    const OpenAI = mod.default ?? mod;
    if (!options.apiKey) throw new Error("openaiCompatible() requires { apiKey } - it has no env-var fallback for an arbitrary provider");
    return new OpenAI({ apiKey: options.apiKey, baseURL: options.baseURL });
  }

  return {
    id: `openaiCompatible:${modelId}`,
    guaranteeLevel: options.guaranteeLevel ?? "best-effort",
    capabilities: { streaming: true, chat: true, structuredOutput: true, toolCalling: false, skillDispatch: true },

    async generate<T>(prompt: string, schema: SchemaInput<T>, systemPrompt?: string, callOptions?: ModelCallOptions): Promise<T> {
      const compatClient = await client();
      const { system, user } = buildStructuredPrompt(prompt, schema, systemPrompt);

      const response = await compatClient.chat.completions.create(
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
      const compatClient = await client();

      const response = await compatClient.chat.completions.create({
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
      const compatClient = await client();
      const { system, user } = buildStructuredPrompt(prompt, schema, systemPrompt);

      const stream = await compatClient.chat.completions.create(
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
