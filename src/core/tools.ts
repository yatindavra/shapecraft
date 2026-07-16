import type {
  ChatMessage,
  SchemaInput,
  ShapecraftModel,
  ToolCallOptions,
  ToolCallResponse,
  ToolDefinition,
  ToolResult,
  ToolTurn,
} from "../types.js";
import { MaxToolTurnsExceededError, ToolExecutionError } from "../types.js";
import { validateOutput, isZodSchema } from "./validate.js";
import { toJsonSchema } from "./schema.js";
import { generate } from "./generate.js";

/**
 * Converts a tool's `parameters: SchemaInput` into the plain JSON-schema shape
 * every provider's native tools API expects. Only Zod and raw `{ jsonSchema }`
 * make sense as a tool's argument signature - `pattern`/`validate`/`xml` have
 * no sensible representation as a named-parameters object, so those throw
 * clearly here rather than silently producing a broken tool definition.
 */
export function toolParametersJsonSchema(schema: SchemaInput): Record<string, unknown> {
  if (isZodSchema(schema)) return toJsonSchema(schema);
  if ("jsonSchema" in (schema as object)) return (schema as { jsonSchema: Record<string, unknown> }).jsonSchema;
  throw new Error("Tool parameters must be a Zod schema or { jsonSchema } - pattern/validate/xml are not valid tool parameter shapes.");
}

/**
 * Shared by every OpenAI-wire-format backend (openai(), groq(), and - once
 * their branches merge - fireworks()/mistral()/openRouter()/deepseek(), which
 * all use the same `{ type: "function", function: {...} }` tools shape).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toOpenAiCompatibleTools(tools: ToolDefinition[]): any[] {
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: toolParametersJsonSchema(t.parameters) },
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toOpenAiCompatibleMessages(messages: ChatMessage[], systemPrompt?: string): any[] {
  return [
    ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
    ...messages.map((m) => {
      if (m.role === "tool") return { role: "tool" as const, tool_call_id: m.toolCallId, content: m.content };
      if (m.toolCalls) {
        return {
          role: "assistant" as const,
          content: m.content || null,
          tool_calls: m.toolCalls.map((c) => ({
            id: c.id,
            type: "function" as const,
            function: { name: c.name, arguments: JSON.stringify(c.args) },
          })),
        };
      }
      return { role: m.role, content: m.content };
    }),
  ];
}

/**
 * One tool-calling turn against any OpenAI-wire-format chat completions
 * client (openai(), groq(), and - once their branches merge -
 * fireworks()/mistral()/openRouter()/deepseek() all share this exact request/
 * response shape, differing only in which SDK client hits it).
 */
export async function openAiCompatibleToolCall(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  modelId: string,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  systemPrompt?: string
): Promise<ToolCallResponse> {
  const response = await client.chat.completions.create({
    model: modelId,
    messages: toOpenAiCompatibleMessages(messages, systemPrompt),
    tools: toOpenAiCompatibleTools(tools),
  });

  const message = response.choices[0]?.message;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolCalls = (message?.tool_calls as any[] | undefined)?.map((tc) => ({
    id: tc.id as string,
    name: tc.function.name as string,
    args: JSON.parse(tc.function.arguments || "{}"),
  }));

  return {
    ...(message?.content ? { content: message.content } : {}),
    ...(toolCalls ? { toolCalls } : {}),
  };
}

function transcriptToText(messages: ChatMessage[]): string {
  return messages
    .map((m) => {
      if (m.role === "tool") return `Tool result: ${m.content}`;
      return `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`;
    })
    .join("\n");
}

/**
 * Native tool-calling loop: passes the running message history + tool
 * definitions to the model's own `toolCall()` turn, executes any requested
 * tool(s) locally (validating each call's args against that tool's own
 * `parameters` schema first), feeds results back, and repeats until the model
 * stops requesting tools. The final answer is then extracted + validated
 * through an ordinary `generate()` call over the transcript - the same
 * one-shot extraction pattern `turnaround.ts` uses at its completion sentinel,
 * so the structured-answer guarantee is identical to any standalone
 * `generate()` call, not a weaker tool-calling-specific check.
 *
 * A bad tool call from the model (unknown tool name, or args that fail that
 * tool's own schema) is fed back as a "tool" error message so the model can
 * retry - recoverable, since re-prompting can fix it. A handler itself
 * throwing is NOT recoverable this way - it aborts immediately via
 * `ToolExecutionError`, since re-prompting the model can't fix a broken handler.
 */
export async function generateWithTools<T>(
  model: ShapecraftModel,
  tools: ToolDefinition[],
  schema: SchemaInput<T>,
  prompt: string,
  options: ToolCallOptions = {}
): Promise<ToolResult<T>> {
  if (!model.toolCall) {
    throw new Error(`Model "${model.id}" does not support tool calling (missing toolCall()).`);
  }

  const maxTurns = options.maxTurns ?? 10;
  const toolsByName = new Map(tools.map((t) => [t.name, t]));
  const messages: ChatMessage[] = [{ role: "user", content: prompt }];
  const trace: ToolTurn[] = [];

  for (let turn = 1; turn <= maxTurns; turn++) {
    const reply = await model.toolCall(messages, tools, options.systemPrompt);

    if (!reply.toolCalls || reply.toolCalls.length === 0) {
      messages.push({ role: "assistant", content: reply.content ?? "" });
      const transcript = transcriptToText(messages);
      const extracted = await generate<T>(
        model,
        schema,
        `Extract the structured data from the following conversation:\n\n${transcript}`,
        options.maxRetries !== undefined ? { maxRetries: options.maxRetries } : {}
      );
      return { data: extracted.data, toolCalls: trace, attempts: extracted.attempts };
    }

    messages.push({ role: "assistant", content: reply.content ?? "", toolCalls: reply.toolCalls });

    for (const call of reply.toolCalls) {
      const tool = toolsByName.get(call.name);

      if (!tool) {
        const error = `Unknown tool "${call.name}" - available tools: ${tools.map((t) => t.name).join(", ")}`;
        trace.push({ type: "tool-error", call, error });
        messages.push({ role: "tool", content: JSON.stringify({ error }), toolCallId: call.id });
        continue;
      }

      let validatedArgs: unknown;
      try {
        validatedArgs = validateOutput(call.args, tool.parameters);
      } catch (err) {
        const error = `Invalid arguments for tool "${call.name}": ${err instanceof Error ? err.message : String(err)}`;
        trace.push({ type: "tool-error", call, error });
        messages.push({ role: "tool", content: JSON.stringify({ error }), toolCallId: call.id });
        continue;
      }

      let result: unknown;
      try {
        result = await tool.handler(validatedArgs);
      } catch (err) {
        throw new ToolExecutionError(call.name, err);
      }

      trace.push({ type: "tool-call", call, result });
      messages.push({ role: "tool", content: JSON.stringify(result), toolCallId: call.id });
    }
  }

  throw new MaxToolTurnsExceededError(maxTurns);
}
