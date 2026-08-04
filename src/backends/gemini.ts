import { z } from "zod";
import type { ChatMessage, ModelCallOptions, SchemaInput, ShapecraftModel, ToolCallResponse, ToolDefinition } from "../types.js";
import { toJsonSchema, buildStructuredPrompt } from "../core/schema.js";
import { isZodSchema, isGbnfInput } from "../core/validate.js";
import { parseAndValidate } from "../core/parse.js";
import { toolParametersJsonSchema } from "../core/tools.js";

export interface GeminiBackendOptions {
  model?: string;
  apiKey?: string;
}

interface ResponseConfig {
  responseMimeType?: "application/json";
  responseJsonSchema?: unknown;
}

function responseConfigFor(schema: SchemaInput): ResponseConfig {
  // Gemini has no grammar mode (unlike fireworks()/llamaCpp()) - a gbnf input is
  // prompt-only, best-effort, same as every other backend without one.
  if (isGbnfInput(schema)) return {};

  if (isZodSchema(schema)) {
    // responseJsonSchema accepts standard JSON Schema (zodToJsonSchema output)
    // directly - unlike the older responseSchema field, which needs Gemini's own
    // Type-enum-based OpenAPI-subset shape instead of plain JSON Schema.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { responseMimeType: "application/json", responseJsonSchema: toJsonSchema(schema as z.ZodType<any>) };
  }

  if ("jsonSchema" in (schema as object)) {
    return {
      responseMimeType: "application/json",
      responseJsonSchema: (schema as { jsonSchema: Record<string, unknown> }).jsonSchema,
    };
  }

  return { responseMimeType: "application/json" };
}

/**
 * Gemini can't reuse `openAiCompatibleToolCall()` - `@google/genai` models a tool
 * turn as `functionCall`/`functionResponse` Parts inside `contents`, not as
 * OpenAI's flat `tool_calls` array plus `tool`-role messages. Two shape
 * mismatches have to be bridged here:
 *  - A `functionResponse` Part carries the function *name*, but a `"tool"`
 *    ChatMessage only carries `toolCallId`, so names are recovered from the
 *    assistant turn that requested the call.
 *  - `response` must be a JSON object; a handler returning an array or a scalar
 *    gets wrapped rather than sent as-is and rejected.
 *  - Gemini rejects a replayed `functionCall` Part that has lost its
 *    `thoughtSignature` ("required for tools to work correctly", HTTP 400). That
 *    signature is an opaque provider token with nowhere to live on the shared
 *    `ToolCall` type, so it is stashed per model instance and reattached here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toGeminiContents(messages: ChatMessage[], thoughtSignatures: Map<string, string>): any[] {
  const nameByCallId = new Map<string, string>();
  for (const m of messages) {
    for (const call of m.toolCalls ?? []) nameByCallId.set(call.id, call.name);
  }

  return messages.map((m) => {
    if (m.role === "tool") {
      const name = (m.toolCallId && nameByCallId.get(m.toolCallId)) || m.toolCallId || "unknown";
      let response: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(m.content);
        response = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : { result: parsed };
      } catch {
        response = { result: m.content };
      }
      return { role: "user", parts: [{ functionResponse: { name, response } }] };
    }

    if (m.toolCalls?.length) {
      return {
        role: "model",
        parts: m.toolCalls.map((call) => {
          const signature = thoughtSignatures.get(call.id);
          return {
            functionCall: { name: call.name, args: (call.args ?? {}) as Record<string, unknown> },
            ...(signature ? { thoughtSignature: signature } : {}),
          };
        }),
      };
    }

    return { role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] };
  });
}

/**
 * Google Gemini via the official `@google/genai` SDK - not the OpenAI-compatible
 * endpoint, since that's a migration bridge for OpenAI users rather than Gemini's
 * primary integration path, and doesn't expose `responseJsonSchema` (plain JSON
 * Schema) vs. the older `responseSchema` (Gemini's own Type-enum OpenAPI subset).
 * `guaranteeLevel: "native"` - `responseJsonSchema`/`responseMimeType` is server-side
 * constrained decoding, the same tier as `openai()`/`groq()`/`fireworks()`/`mistral()`.
 */
export function gemini(options: GeminiBackendOptions = {}): ShapecraftModel {
  // "gemini-2.5-flash" 404s for new-user accounts ("no longer available to new
  // users") despite still being listed by models.list() - confirmed live. The
  // "-latest" alias tracks whatever Google currently recommends instead of a
  // version string that can get deprecated out from under a hardcoded default.
  const modelId = options.model ?? "gemini-flash-latest";

  // Opaque per-call tokens Gemini requires back on the next turn, keyed by the
  // ToolCall id we hand to generateWithTools(). Scoped to this model instance so
  // it lives exactly as long as the conversation that produced the signatures.
  const thoughtSignatures = new Map<string, string>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function client(): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import("@google/genai").catch(() => {
      throw new Error("Install @google/genai: npm install @google/genai");
    });
    const { GoogleGenAI } = mod;
    return new GoogleGenAI({ apiKey: options.apiKey ?? process.env.GEMINI_API_KEY });
  }

  return {
    id: `gemini:${modelId}`,
    guaranteeLevel: "native",
    capabilities: { streaming: true, chat: true, structuredOutput: true, toolCalling: true, skillDispatch: true },

    async generate<T>(prompt: string, schema: SchemaInput<T>, systemPrompt?: string, callOptions?: ModelCallOptions): Promise<T> {
      const ai = await client();
      const { system, user } = buildStructuredPrompt(prompt, schema, systemPrompt);

      const response = await ai.models.generateContent({
        model: modelId,
        contents: user,
        config: {
          systemInstruction: system,
          ...responseConfigFor(schema),
          ...(callOptions?.signal ? { abortSignal: callOptions.signal } : {}),
        },
      });

      const raw: string = response.text ?? "";

      // extractJson is a defensive no-op if Gemini never wraps output in a markdown
      // fence - kept for the same reason mistral()/openRouter() keep it: cheap
      // insurance against a provider-side formatting quirk breaking every call.
      return parseAndValidate<T>(raw, schema, { extractJson: true });
    },

    async chat(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
      const ai = await client();

      const contents = messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

      const response = await ai.models.generateContent({
        model: modelId,
        contents,
        config: systemPrompt ? { systemInstruction: systemPrompt } : undefined,
      });

      return response.text ?? "";
    },

    async *generateStream<T>(
      prompt: string,
      schema: SchemaInput<T>,
      systemPrompt?: string,
      callOptions?: ModelCallOptions
    ): AsyncIterable<string> {
      const ai = await client();
      const { system, user } = buildStructuredPrompt(prompt, schema, systemPrompt);

      const stream = await ai.models.generateContentStream({
        model: modelId,
        contents: user,
        config: {
          systemInstruction: system,
          ...responseConfigFor(schema),
          ...(callOptions?.signal ? { abortSignal: callOptions.signal } : {}),
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for await (const chunk of stream as AsyncIterable<any>) {
        const delta = chunk.text;
        if (delta) yield delta;
      }
    },

    async toolCall(messages: ChatMessage[], tools: ToolDefinition[], systemPrompt?: string, callOptions?: ModelCallOptions): Promise<ToolCallResponse> {
      const ai = await client();

      const response = await ai.models.generateContent({
        model: modelId,
        contents: toGeminiContents(messages, thoughtSignatures),
        config: {
          ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
          tools: [
            {
              functionDeclarations: tools.map((t) => ({
                name: t.name,
                description: t.description,
                // parametersJsonSchema takes plain JSON Schema; the older `parameters`
                // field would need Gemini's Type-enum OpenAPI subset instead. Same
                // distinction as responseJsonSchema vs responseSchema above.
                parametersJsonSchema: toolParametersJsonSchema(t.parameters),
              })),
            },
          ],
          ...(callOptions?.signal ? { abortSignal: callOptions.signal } : {}),
        },
      });

      // Read the raw Parts rather than the response.functionCalls convenience
      // getter: the getter drops each call's sibling thoughtSignature, which the
      // next turn must send back. Falls back to the getter when candidates are
      // absent, so a minimal stub still works.
      type GeminiPart = { functionCall?: { id?: string; name?: string; args?: Record<string, unknown> }; thoughtSignature?: string };
      const parts = (response.candidates?.[0]?.content?.parts ?? []) as GeminiPart[];
      const fromParts = parts.filter((p) => p.functionCall?.name);
      const calls: Array<{ id?: string; name?: string; args?: Record<string, unknown>; thoughtSignature?: string }> = fromParts.length
        ? fromParts.map((p) => ({ ...p.functionCall, thoughtSignature: p.thoughtSignature }))
        : ((response.functionCalls ?? []) as Array<{ id?: string; name?: string; args?: Record<string, unknown> }>).filter((c) => c.name);

      // Gemini's FunctionCall.id is optional in the SDK type (and unset on some
      // surfaces, e.g. Vertex) while generateWithTools() correlates each result
      // back by id - so synthesize a stable per-turn one when it is absent.
      const toolCalls = calls.map((c, i) => {
        const id = c.id ?? `${modelId}-call-${i}-${c.name}`;
        if (c.thoughtSignature) thoughtSignatures.set(id, c.thoughtSignature);
        return { id, name: c.name as string, args: c.args ?? {} };
      });

      const text: string = response.text ?? "";

      return {
        ...(text ? { content: text } : {}),
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
      };
    },
  };
}
