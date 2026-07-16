import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { generateWithTools } from "../src/core/tools.js";
import { openai } from "../src/backends/openai.js";
import { groq } from "../src/backends/groq.js";
import { anthropic } from "../src/backends/anthropic.js";
import { ollama } from "../src/backends/ollama.js";
import { MaxToolTurnsExceededError, ToolExecutionError } from "../src/types.js";
import type { ShapecraftModel, ToolCallResponse, ToolDefinition } from "../src/types.js";

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
