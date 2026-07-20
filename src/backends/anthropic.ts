import type { ChatMessage, ImageContent, ModelCallOptions, SchemaInput, ShapecraftModel } from "../types.js";
import { buildStructuredPrompt } from "../core/schema.js";
import { parseAndValidate } from "../core/parse.js";

export interface AnthropicBackendOptions {
  model?: string;
  apiKey?: string;
}

/**
 * Anthropic's own content-block shape - distinct from the OpenAI-compatible
 * `image_url` form the Group-A backends share. `source.type` is `"url"` for a real
 * URL (Claude's API fetches it server-side, no client-side fetch needed) or
 * `"base64"` for inline data.
 */
function userContentFor(text: string, images?: ImageContent[]): string | Record<string, unknown>[] {
  if (!images || images.length === 0) return text;

  return [
    { type: "text", text },
    ...images.map((img) =>
      "url" in img
        ? { type: "image", source: { type: "url", url: img.url } }
        : { type: "image", source: { type: "base64", media_type: img.mimeType, data: img.data } }
    ),
  ];
}

export function anthropic(options: AnthropicBackendOptions = {}): ShapecraftModel {
  const modelId = options.model ?? "claude-sonnet-4-6";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function client(): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import("@anthropic-ai/sdk").catch(() => {
      throw new Error("Install sdk: npm install @anthropic-ai/sdk");
    });
    const AnthropicClass = mod.default ?? mod;
    return new AnthropicClass({ apiKey: options.apiKey ?? process.env.ANTHROPIC_API_KEY });
  }

  return {
    id: `anthropic:${modelId}`,
    guaranteeLevel: "best-effort",
    capabilities: { streaming: true, chat: true, structuredOutput: true, toolCalling: false, skillDispatch: true },

    async generate<T>(prompt: string, schema: SchemaInput<T>, systemPrompt?: string, callOptions?: ModelCallOptions): Promise<T> {
      const anthropicClient = await client();
      const { system, user } = buildStructuredPrompt(prompt, schema, systemPrompt);

      const response = await anthropicClient.messages.create(
        {
          model: modelId,
          max_tokens: 4096,
          system,
          messages: [{ role: "user", content: userContentFor(user, callOptions?.images) }],
        },
        callOptions?.signal ? { signal: callOptions.signal } : undefined
      );

      const raw: string =
        response.content[0]?.type === "text" ? response.content[0].text : "";

      return parseAndValidate<T>(raw, schema, { extractJson: true });
    },

    async chat(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
      const anthropicClient = await client();

      const response = await anthropicClient.messages.create({
        model: modelId,
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      });

      return response.content[0]?.type === "text" ? response.content[0].text : "";
    },

    async *generateStream<T>(
      prompt: string,
      schema: SchemaInput<T>,
      systemPrompt?: string,
      callOptions?: ModelCallOptions
    ): AsyncIterable<string> {
      const anthropicClient = await client();
      const { system, user } = buildStructuredPrompt(prompt, schema, systemPrompt);

      const stream = anthropicClient.messages.stream(
        {
          model: modelId,
          max_tokens: 4096,
          system,
          messages: [{ role: "user", content: userContentFor(user, callOptions?.images) }],
        },
        callOptions?.signal ? { signal: callOptions.signal } : undefined
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for await (const event of stream as AsyncIterable<any>) {
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          yield event.delta.text as string;
        }
      }
    },
  };
}
