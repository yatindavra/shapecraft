import { z } from "zod";
import type { ChatMessage, ModelCallOptions, SchemaInput, ShapecraftModel } from "../types.js";
import { toJsonSchema, buildStructuredPrompt } from "../core/schema.js";
import { isZodSchema, isGbnfInput } from "../core/validate.js";
import { parseAndValidate } from "../core/parse.js";

export interface CerebrasBackendOptions {
  model?: string;
  apiKey?: string;
  baseURL?: string;
}

/**
 * Cerebras' strict json_schema mode rejects the `format` keyword outright
 * ("Invalid fields for schema with types ['string']: {'format'}") - confirmed
 * live. Zod v4's native `toJSONSchema()` adds `format: "email"`/`"uri"`/etc.
 * for `.email()`/`.url()`/similar refinements, which every other native-tier
 * backend (OpenAI/Mistral/Together) accepts fine. The underlying `pattern`
 * regex those refinements also emit still enforces the same shape, so
 * stripping `format` loses no real validation - it's a redundant hint Cerebras
 * specifically can't parse.
 */
function stripFormat(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripFormat);
  if (node && typeof node === "object") {
    const { format: _format, ...rest } = node as Record<string, unknown>;
    return Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, stripFormat(v)]));
  }
  return node;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function responseFormatFor(schema: SchemaInput): any {
  // No grammar mode - a gbnf input is prompt-only, best-effort, same as
  // openai()/groq()/mistral().
  if (isGbnfInput(schema)) return undefined;
  return isZodSchema(schema)
    ? {
        type: "json_schema" as const,
        json_schema: { name: "output", strict: true, schema: stripFormat(toJsonSchema(schema as z.ZodType<any>)) },
      }
    : "jsonSchema" in (schema as object)
      ? {
          type: "json_schema" as const,
          json_schema: { name: "output", strict: false, schema: (schema as { jsonSchema: Record<string, unknown> }).jsonSchema },
        }
      : { type: "json_object" as const };
}

/**
 * Cerebras - OpenAI-compatible chat completions API, reached via the `openai`
 * package pointed at Cerebras' base URL (same dependency `openai()`/`fireworks()`/
 * `mistral()` already use, no new SDK needed). `guaranteeLevel: "native"` -
 * `response_format: { type: "json_schema", strict: true, ... }` is server-side
 * enforced, same tier as `openai()`/`groq()`/`fireworks()`/`mistral()`/`together()`.
 * No grammar mode - a `{ gbnf }` input is prompt-only, best-effort, same as every
 * other backend without one.
 */
export function cerebras(options: CerebrasBackendOptions = {}): ShapecraftModel {
  const modelId = options.model ?? "gpt-oss-120b";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function client(): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import("openai").catch(() => {
      throw new Error("Install openai: npm install openai");
    });
    const OpenAI = mod.default ?? mod;
    const apiKey = options.apiKey ?? process.env.CEREBRAS_API_KEY;
    // The openai package falls back to reading OPENAI_API_KEY itself when apiKey
    // is undefined (not just omitted) - passing it through unchecked would silently
    // authenticate against Cerebras' endpoint with an unrelated OpenAI key instead
    // of failing clearly.
    if (!apiKey) throw new Error("Missing Cerebras API key: pass { apiKey } or set CEREBRAS_API_KEY");
    return new OpenAI({ apiKey, baseURL: options.baseURL ?? "https://api.cerebras.ai/v1" });
  }

  return {
    id: `cerebras:${modelId}`,
    guaranteeLevel: "native",
    capabilities: { streaming: true, chat: true, structuredOutput: true, toolCalling: false, skillDispatch: true },

    async generate<T>(prompt: string, schema: SchemaInput<T>, systemPrompt?: string, callOptions?: ModelCallOptions): Promise<T> {
      const cerebrasClient = await client();
      const { system, user } = buildStructuredPrompt(prompt, schema, systemPrompt);

      const response = await cerebrasClient.chat.completions.create(
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
      const cerebrasClient = await client();

      const response = await cerebrasClient.chat.completions.create({
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
      const cerebrasClient = await client();
      const { system, user } = buildStructuredPrompt(prompt, schema, systemPrompt);

      const stream = await cerebrasClient.chat.completions.create(
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
