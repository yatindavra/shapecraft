import type { ChatMessage, ModelCallOptions, SchemaInput, ShapecraftModel, ToolCallResponse, ToolDefinition } from "../types.js";
import { buildStructuredPrompt } from "../core/schema.js";
import { parseAndValidate } from "../core/parse.js";
import { toolParametersJsonSchema } from "../core/tools.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toAnthropicTools(tools: ToolDefinition[]): any[] {
  return tools.map((t) => ({ name: t.name, description: t.description, input_schema: toolParametersJsonSchema(t.parameters) }));
}

/**
 * Anthropic has no separate "tool" role - a tool result is sent back as a
 * "user" message with a `tool_result` content block, and every tool_result
 * for the same turn must be combined into ONE user message, not one each.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toAnthropicMessages(messages: ChatMessage[]): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any[] = [];

  for (const m of messages) {
    if (m.role === "tool") {
      const block = { type: "tool_result", tool_use_id: m.toolCallId, content: m.content };
      const last = result[result.length - 1];
      if (last?.role === "user" && Array.isArray(last.content) && last.content[0]?.type === "tool_result") {
        last.content.push(block);
      } else {
        result.push({ role: "user", content: [block] });
      }
      continue;
    }

    if (m.role === "assistant" && m.toolCalls) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const content: any[] = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const c of m.toolCalls) content.push({ type: "tool_use", id: c.id, name: c.name, input: c.args });
      result.push({ role: "assistant", content });
      continue;
    }

    result.push({ role: m.role, content: m.content });
  }

  return result;
}

export interface AnthropicBackendOptions {
  model?: string;
  apiKey?: string;
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
    capabilities: { streaming: true, chat: true, structuredOutput: true, toolCalling: true, skillDispatch: true },

    async generate<T>(prompt: string, schema: SchemaInput<T>, systemPrompt?: string, callOptions?: ModelCallOptions): Promise<T> {
      const anthropicClient = await client();
      const { system, user } = buildStructuredPrompt(prompt, schema, systemPrompt);

      const response = await anthropicClient.messages.create(
        {
          model: modelId,
          max_tokens: 4096,
          system,
          messages: [{ role: "user", content: user }],
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
          messages: [{ role: "user", content: user }],
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

    async toolCall(messages: ChatMessage[], tools: ToolDefinition[], systemPrompt?: string): Promise<ToolCallResponse> {
      const anthropicClient = await client();

      const response = await anthropicClient.messages.create({
        model: modelId,
        max_tokens: 4096,
        system: systemPrompt,
        messages: toAnthropicMessages(messages),
        tools: toAnthropicTools(tools),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blocks = response.content as any[];
      const text = blocks
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      const toolUseBlocks = blocks.filter((b) => b.type === "tool_use");
      const toolCalls = toolUseBlocks.length
        ? toolUseBlocks.map((b) => ({ id: b.id as string, name: b.name as string, args: b.input }))
        : undefined;

      return {
        ...(text ? { content: text } : {}),
        ...(toolCalls ? { toolCalls } : {}),
      };
    },
  };
}
