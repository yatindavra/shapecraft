import { describe, it, expect, vi, afterEach } from "vitest";
import { z } from "zod";
import { generateWithTools } from "../src/core/tools.js";
import { openai } from "../src/backends/openai.js";
import { groq } from "../src/backends/groq.js";
import { anthropic } from "../src/backends/anthropic.js";
import { ollama } from "../src/backends/ollama.js";
import { mistral } from "../src/backends/mistral.js";
import { gemini } from "../src/backends/gemini.js";
import { MaxToolTurnsExceededError, ToolExecutionError } from "../src/types.js";
import type { ChatMessage, ShapecraftModel, ToolCallResponse, ToolDefinition } from "../src/types.js";

/** Scripted tool-calling model: one `ToolCallResponse` per `toolCall()` call, in order. `extractResult` backs the final `generate()` extraction pass. */
function mockToolModel(toolCallScript: ToolCallResponse[], extractResult: unknown): ShapecraftModel {
  let call = 0;
  return {
    id: "mock:tools",
    guaranteeLevel: "constrained",
    async generate<T>(): Promise<T> {
      return extractResult as T;
    },
    async toolCall(): Promise<ToolCallResponse> {
      const reply = toolCallScript[call];
      call++;
      if (!reply) throw new Error("mock exhausted: no scripted reply for this turn");
      return reply;
    },
  };
}

const WeatherSchema = z.object({ city: z.string() });
const AnswerSchema = z.object({ summary: z.string() });

describe("generateWithTools", () => {
  it("calls a requested tool with validated args, feeds the result back, then extracts the final answer", async () => {
    const handler = vi.fn(async ({ city }: { city: string }) => ({ tempC: 22, city }));
    const getWeather: ToolDefinition = { name: "get_weather", parameters: WeatherSchema, handler: handler as ToolDefinition["handler"] };

    const model = mockToolModel(
      [{ toolCalls: [{ id: "call_1", name: "get_weather", args: { city: "Lisbon" } }] }, { content: "It's 22C and sunny in Lisbon." }],
      { summary: "sunny, 22C in Lisbon" }
    );

    const result = await generateWithTools(model, [getWeather], AnswerSchema, "What's the weather in Lisbon?");

    expect(handler).toHaveBeenCalledWith({ city: "Lisbon" });
    expect(result.data).toEqual({ summary: "sunny, 22C in Lisbon" });
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({ type: "tool-call", result: { tempC: 22, city: "Lisbon" } });
  });

  it("executes multiple tool calls returned in a single turn, in order", async () => {
    const calls: string[] = [];
    const getWeather: ToolDefinition = {
      name: "get_weather",
      parameters: WeatherSchema,
      handler: (async ({ city }: { city: string }) => {
        calls.push(city);
        return { city };
      }) as ToolDefinition["handler"],
    };

    const model = mockToolModel(
      [
        {
          toolCalls: [
            { id: "call_1", name: "get_weather", args: { city: "Lisbon" } },
            { id: "call_2", name: "get_weather", args: { city: "Porto" } },
          ],
        },
        { content: "Both cities checked." },
      ],
      { summary: "done" }
    );

    const result = await generateWithTools(model, [getWeather], AnswerSchema, "Compare Lisbon and Porto weather.");

    expect(calls).toEqual(["Lisbon", "Porto"]);
    expect(result.toolCalls).toHaveLength(2);
  });

  it("a tool call with args that fail its own parameters schema never reaches the handler", async () => {
    const handler = vi.fn();
    const getWeather: ToolDefinition = { name: "get_weather", parameters: WeatherSchema, handler };

    // First turn: model sends args missing the required "city" field. Second turn: model gives up and answers.
    const model = mockToolModel(
      [{ toolCalls: [{ id: "call_1", name: "get_weather", args: {} }] }, { content: "I couldn't get the weather." }],
      { summary: "no data" }
    );

    const result = await generateWithTools(model, [getWeather], AnswerSchema, "What's the weather?");

    expect(handler).not.toHaveBeenCalled();
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].type).toBe("tool-error");
  });

  it("an unknown tool name never reaches any handler", async () => {
    const handler = vi.fn();
    const getWeather: ToolDefinition = { name: "get_weather", parameters: WeatherSchema, handler };

    const model = mockToolModel(
      [{ toolCalls: [{ id: "call_1", name: "get_stock_price", args: { symbol: "ACME" } }] }, { content: "done" }],
      { summary: "done" }
    );

    const result = await generateWithTools(model, [getWeather], AnswerSchema, "irrelevant");

    expect(handler).not.toHaveBeenCalled();
    expect(result.toolCalls[0]).toMatchObject({ type: "tool-error" });
  });

  it("a tool handler throwing aborts immediately with ToolExecutionError, not retried", async () => {
    const getWeather: ToolDefinition = {
      name: "get_weather",
      parameters: WeatherSchema,
      handler: (async () => {
        throw new Error("upstream API down");
      }) as ToolDefinition["handler"],
    };

    const model = mockToolModel([{ toolCalls: [{ id: "call_1", name: "get_weather", args: { city: "Lisbon" } }] }], { summary: "unreachable" });

    await expect(generateWithTools(model, [getWeather], AnswerSchema, "weather?")).rejects.toBeInstanceOf(ToolExecutionError);
  });

  it("throws MaxToolTurnsExceededError when the model never stops requesting tools", async () => {
    const getWeather: ToolDefinition = {
      name: "get_weather",
      parameters: WeatherSchema,
      handler: (async ({ city }: { city: string }) => ({ city })) as ToolDefinition["handler"],
    };

    const script: ToolCallResponse[] = Array.from({ length: 5 }, () => ({
      toolCalls: [{ id: "call_x", name: "get_weather", args: { city: "Lisbon" } }],
    }));
    const model = mockToolModel(script, { summary: "unreachable" });

    await expect(generateWithTools(model, [getWeather], AnswerSchema, "weather?", { maxTurns: 3 })).rejects.toBeInstanceOf(
      MaxToolTurnsExceededError
    );
  });

  it("a model without toolCall() throws a clear error instead of silently failing", async () => {
    const model: ShapecraftModel = {
      id: "mock:no-tools",
      guaranteeLevel: "constrained",
      async generate<T>(): Promise<T> {
        return {} as T;
      },
    };
    const getWeather: ToolDefinition = { name: "get_weather", parameters: WeatherSchema, handler: async () => ({}) };

    await expect(generateWithTools(model, [getWeather], AnswerSchema, "weather?")).rejects.toThrow(/does not support tool calling/);
  });
});

// --- Real API - one tool round-trip per backend, skipped when key not in .env ---

const hasOpenAI = !!process.env.OPENAI_API_KEY;
const hasGroq = !!process.env.GROQ_API_KEY;
const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
const hasOllama = !!process.env.OLLAMA_MODEL;
const hasMistral = !!process.env.MISTRAL_API_KEY;
const hasGemini = !!process.env.GEMINI_API_KEY;

const getWeatherTool: ToolDefinition = {
  name: "get_weather",
  description: "Get current weather for a city",
  parameters: z.object({ city: z.string() }),
  handler: (async ({ city }: { city: string }) => ({ city, tempC: 22, condition: "sunny" })) as ToolDefinition["handler"],
};

async function realWeatherCheck(model: ShapecraftModel) {
  const result = await generateWithTools(
    model,
    [getWeatherTool],
    z.object({ city: z.string(), condition: z.string() }),
    "What's the weather in Lisbon? Use the get_weather tool, then summarize."
  );
  expect(result.toolCalls.length).toBeGreaterThan(0);
  expect(result.data).toMatchObject({ city: expect.any(String), condition: expect.any(String) });
  console.log("[real] tool-calling result:", result.data, "trace:", result.toolCalls);
}

describe("generateWithTools - OpenAI backend (real API)", () => {
  it.skipIf(!hasOpenAI)("calls get_weather then answers", async () => {
    await realWeatherCheck(openai({ model: "gpt-4o-mini" }));
  }, 30_000);
});

describe("generateWithTools - Groq backend (real API)", () => {
  it.skipIf(!hasGroq)("calls get_weather then answers", async () => {
    await realWeatherCheck(groq({ model: "llama-3.3-70b-versatile" }));
  }, 30_000);
});

describe("generateWithTools - Anthropic backend (real API)", () => {
  it.skipIf(!hasAnthropic)("calls get_weather then answers", async () => {
    await realWeatherCheck(anthropic({ model: "claude-haiku-4-5-20251001" }));
  }, 30_000);
});

describe("generateWithTools - Ollama backend (real API)", () => {
  // Two turns against a CPU-bound local model can each take ~180s - generous
  // timeout here is about slow local hardware, not the implementation.
  it.skipIf(!hasOllama)("calls get_weather then answers", async () => {
    await realWeatherCheck(ollama({ model: process.env.OLLAMA_MODEL ?? "gemma4:e2b", timeoutMs: 300_000 }));
  }, 480_000);
});

// mistral() is the one newly-wired OpenAI-compatible backend with a usable key
// here, so it stands in as the live proof that openAiCompatibleToolCall() works
// through a non-openai()/groq() client. fireworks()/openRouter()/deepseek() take
// the identical code path but have no working credentials to verify against.
describe("generateWithTools - Mistral backend (real API)", () => {
  it.skipIf(!hasMistral)("calls get_weather then answers", async () => {
    await realWeatherCheck(mistral({ model: "mistral-small-latest" }));
  }, 30_000);
});

// The live counterpart to the stubbed shape assertions below: gemini() is the
// only backend whose tool turn is built from functionCall/functionResponse
// Parts, so it is worth exercising against the real API, not just a stub.
describe("generateWithTools - Gemini backend (real API)", () => {
  it.skipIf(!hasGemini)("calls get_weather then answers", async () => {
    await realWeatherCheck(gemini({ model: "gemini-flash-latest" }));
  }, 60_000);
});

// gemini() is the one backend that can't reuse openAiCompatibleToolCall() - it
// has to rebuild the transcript as functionCall/functionResponse Parts. That
// conversion is the part most likely to break and can't be reached by any live
// test while the key is quota-blocked, so it is asserted directly against a
// stubbed @google/genai client.
describe("gemini() toolCall - request shape", () => {
  afterEach(() => vi.resetModules());

  async function captureGeminiRequest(scriptedResponse: Record<string, unknown>, messages: ChatMessage[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let captured: any;
    vi.doMock("@google/genai", () => ({
      GoogleGenAI: class {
        models = {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          generateContent: async (req: any) => {
            captured = req;
            return scriptedResponse;
          },
        };
      },
    }));

    const { gemini } = await import("../src/backends/gemini.js");
    const model = gemini({ model: "gemini-flash-latest", apiKey: "test-key" });
    const reply = await model.toolCall!(messages, [getWeatherTool], "be terse");
    return { captured, reply };
  }

  it("sends parametersJsonSchema (plain JSON Schema), not Gemini's Type-enum shape", async () => {
    const { captured } = await captureGeminiRequest({ text: "done", functionCalls: undefined }, [{ role: "user", content: "weather in Lisbon?" }]);

    const decl = captured.config.tools[0].functionDeclarations[0];
    expect(decl.name).toBe("get_weather");
    expect(decl.parametersJsonSchema).toMatchObject({ type: "object", properties: { city: { type: "string" } } });
    // `parameters` is mutually exclusive with parametersJsonSchema in the SDK.
    expect(decl.parameters).toBeUndefined();
    expect(captured.config.systemInstruction).toBe("be terse");
  });

  it("synthesizes an id when Gemini omits one, since generateWithTools correlates by it", async () => {
    const { reply } = await captureGeminiRequest({ text: "", functionCalls: [{ name: "get_weather", args: { city: "Lisbon" } }] }, [
      { role: "user", content: "weather in Lisbon?" },
    ]);

    expect(reply.toolCalls).toHaveLength(1);
    expect(reply.toolCalls![0].id).toBeTruthy();
    expect(reply.toolCalls![0]).toMatchObject({ name: "get_weather", args: { city: "Lisbon" } });
  });

  it("rebuilds a tool result as a functionResponse Part carrying the function name", async () => {
    const { captured } = await captureGeminiRequest({ text: "18C", functionCalls: undefined }, [
      { role: "user", content: "weather in Lisbon?" },
      { role: "assistant", content: "", toolCalls: [{ id: "call-1", name: "get_weather", args: { city: "Lisbon" } }] },
      { role: "tool", content: JSON.stringify({ tempC: 18 }), toolCallId: "call-1" },
    ]);

    expect(captured.contents[1]).toEqual({ role: "model", parts: [{ functionCall: { name: "get_weather", args: { city: "Lisbon" } } }] });
    // The name is recovered from the assistant turn - a "tool" ChatMessage only
    // carries toolCallId, but Gemini's functionResponse Part requires the name.
    expect(captured.contents[2]).toEqual({ role: "user", parts: [{ functionResponse: { name: "get_weather", response: { tempC: 18 } } }] });
  });

  // Regression: Gemini 400s with "Function call is missing a thought_signature"
  // if a replayed functionCall Part loses the opaque token it came back with.
  // The signature has no home on the shared ToolCall type, so the backend keeps
  // it per instance and reattaches it on the next turn.
  it("round-trips thoughtSignature back onto the replayed functionCall Part", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seen: any[] = [];
    vi.doMock("@google/genai", () => ({
      GoogleGenAI: class {
        models = {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          generateContent: async (req: any) => {
            seen.push(req);
            if (seen.length === 1) {
              return {
                text: "",
                candidates: [
                  { content: { parts: [{ functionCall: { id: "fc-1", name: "get_weather", args: { city: "Lisbon" } }, thoughtSignature: "SIG-ABC" }] } },
                ],
              };
            }
            return { text: "18C in Lisbon", candidates: [{ content: { parts: [{ text: "18C in Lisbon" }] } }] };
          },
        };
      },
    }));

    const { gemini } = await import("../src/backends/gemini.js");
    const model = gemini({ model: "gemini-flash-latest", apiKey: "test-key" });

    const first = await model.toolCall!([{ role: "user", content: "weather?" }], [getWeatherTool]);
    expect(first.toolCalls![0].id).toBe("fc-1");

    await model.toolCall!(
      [
        { role: "user", content: "weather?" },
        { role: "assistant", content: "", toolCalls: first.toolCalls },
        { role: "tool", content: JSON.stringify({ tempC: 18 }), toolCallId: "fc-1" },
      ],
      [getWeatherTool]
    );

    expect(seen[1].contents[1].parts[0].thoughtSignature).toBe("SIG-ABC");
  });

  it("wraps a non-object tool result, which Gemini's response field rejects", async () => {
    const { captured } = await captureGeminiRequest({ text: "ok", functionCalls: undefined }, [
      { role: "assistant", content: "", toolCalls: [{ id: "call-1", name: "get_weather", args: {} }] },
      { role: "tool", content: JSON.stringify([1, 2, 3]), toolCallId: "call-1" },
    ]);

    expect(captured.contents[1].parts[0].functionResponse.response).toEqual({ result: [1, 2, 3] });
  });
});
