import { describe, it, expect, vi, afterEach } from "vitest";
import { z } from "zod";
import { generate } from "../src/core/generate.js";
import { openai } from "../src/backends/openai.js";
import { groq } from "../src/backends/groq.js";
import { anthropic } from "../src/backends/anthropic.js";
import { ollama } from "../src/backends/ollama.js";
import { fireworks } from "../src/backends/fireworks.js";
import { mistral } from "../src/backends/mistral.js";
import { openRouter } from "../src/backends/openRouter.js";
import { gemini } from "../src/backends/gemini.js";
import { deepseek } from "../src/backends/deepseek.js";
import { together } from "../src/backends/together.js";
import { cerebras } from "../src/backends/cerebras.js";
import { grok } from "../src/backends/grok.js";
import { openaiCompatible } from "../src/backends/openaiCompatible.js";
import { llamaCpp } from "../src/backends/llamaCpp.js";
import { mockModel } from "./helpers/index.js";

const PersonSchema = z.object({ name: z.string(), age: z.number() });

describe("ShapecraftModel.capabilities", () => {
  // Every cloud backend now implements toolCall(): the OpenAI-wire-format ones
  // share openAiCompatibleToolCall(), while anthropic, ollama and gemini each
  // have their own. llamaCpp is the sole exception, asserted separately below.
  it.each([
    ["openai", openai({ model: "gpt-4o-mini" })],
    ["groq", groq({ model: "llama-3.3-70b-versatile" })],
    ["anthropic", anthropic({ model: "claude-haiku-4-5-20251001" })],
    ["ollama", ollama({ model: "llama3.2" })],
    ["fireworks", fireworks({ model: "accounts/fireworks/models/llama-v3p1-70b-instruct" })],
    ["mistral", mistral({ model: "mistral-large-latest" })],
    ["openRouter", openRouter({ model: "openai/gpt-4o-mini" })],
    ["deepseek", deepseek({ model: "deepseek-v4-flash" })],
    ["gemini", gemini({ model: "gemini-flash-latest" })],
  ])("%s exposes streaming/chat/structuredOutput/skillDispatch/toolCalling true", (_name, model) => {
    expect(model.capabilities).toEqual({
      streaming: true,
      chat: true,
      structuredOutput: true,
      toolCalling: true,
      skillDispatch: true,
    });
  });

  it.each([
    ["together", together({ model: "meta-llama/Llama-3.3-70B-Instruct-Turbo" })],
    ["cerebras", cerebras({ model: "gpt-oss-120b" })],
    ["grok", grok({ model: "grok-4.5" })],
    ["openaiCompatible", openaiCompatible({ baseURL: "https://api.example.com/v1", apiKey: "test-key", model: "test-model" })],
  ])("%s exposes streaming/chat/structuredOutput/skillDispatch true, toolCalling false - no toolCall() yet", (_name, model) => {
    expect(model.capabilities).toEqual({
      streaming: true,
      chat: true,
      structuredOutput: true,
      toolCalling: false,
      skillDispatch: true,
    });
  });

  it("llamaCpp reports streaming/toolCalling false - no delta iterator, no tools API", () => {
    expect(llamaCpp({ modelPath: "/nonexistent/model.gguf" }).capabilities).toEqual({
      streaming: false,
      chat: true,
      structuredOutput: true,
      toolCalling: false,
      skillDispatch: true,
    });
  });

  // Guards the invariant that used to drift: a backend advertising toolCalling
  // must actually implement toolCall(), and one that doesn't must not claim it.
  // This is what let fireworks/mistral/openRouter/deepseek sit at `false` while
  // the OpenAI-compatible helper they could reuse already existed.
  it.each([
    ["openai", openai({ model: "gpt-4o-mini" })],
    ["groq", groq({ model: "llama-3.3-70b-versatile" })],
    ["anthropic", anthropic({ model: "claude-haiku-4-5-20251001" })],
    ["ollama", ollama({ model: "llama3.2" })],
    ["fireworks", fireworks({ model: "accounts/fireworks/models/llama-v3p1-70b-instruct" })],
    ["mistral", mistral({ model: "mistral-large-latest" })],
    ["openRouter", openRouter({ model: "openai/gpt-4o-mini" })],
    ["deepseek", deepseek({ model: "deepseek-v4-flash" })],
    ["gemini", gemini({ model: "gemini-flash-latest" })],
    ["together", together({ model: "meta-llama/Llama-3.3-70B-Instruct-Turbo" })],
    ["cerebras", cerebras({ model: "gpt-oss-120b" })],
    ["grok", grok({ model: "grok-4.5" })],
    ["openaiCompatible", openaiCompatible({ baseURL: "https://api.example.com/v1", apiKey: "test-key", model: "test-model" })],
    ["llamaCpp", llamaCpp({ modelPath: "/nonexistent/model.gguf" })],
  ])("%s: capabilities.toolCalling matches whether toolCall() actually exists", (_name, model) => {
    expect(model.capabilities?.toolCalling).toBe(typeof model.toolCall === "function");
  });

  it.each([
    ["openai", openai({ model: "gpt-4o-mini" })],
    ["groq", groq({ model: "llama-3.3-70b-versatile" })],
    ["anthropic", anthropic({ model: "claude-haiku-4-5-20251001" })],
    ["ollama", ollama({ model: "llama3.2" })],
    ["fireworks", fireworks({ model: "accounts/fireworks/models/llama-v3p1-70b-instruct" })],
    ["mistral", mistral({ model: "mistral-large-latest" })],
    ["openRouter", openRouter({ model: "openai/gpt-4o-mini" })],
    ["deepseek", deepseek({ model: "deepseek-v4-flash" })],
    ["gemini", gemini({ model: "gemini-flash-latest" })],
    ["together", together({ model: "meta-llama/Llama-3.3-70B-Instruct-Turbo" })],
    ["cerebras", cerebras({ model: "gpt-oss-120b" })],
    ["grok", grok({ model: "grok-4.5" })],
    ["openaiCompatible", openaiCompatible({ baseURL: "https://api.example.com/v1", apiKey: "test-key", model: "test-model" })],
    ["llamaCpp", llamaCpp({ modelPath: "/nonexistent/model.gguf" })],
  ])("%s: capabilities.streaming matches whether generateStream() actually exists", (_name, model) => {
    expect(model.capabilities?.streaming).toBe(typeof model.generateStream === "function");
  });

  // Every backend must declare capabilities at all - llamaCpp shipped without
  // one, so `model.capabilities` was undefined there while every other backend
  // returned an object.
  it.each([
    ["openai", openai({ model: "gpt-4o-mini" })],
    ["groq", groq({ model: "llama-3.3-70b-versatile" })],
    ["anthropic", anthropic({ model: "claude-haiku-4-5-20251001" })],
    ["ollama", ollama({ model: "llama3.2" })],
    ["fireworks", fireworks({ model: "accounts/fireworks/models/llama-v3p1-70b-instruct" })],
    ["mistral", mistral({ model: "mistral-large-latest" })],
    ["openRouter", openRouter({ model: "openai/gpt-4o-mini" })],
    ["deepseek", deepseek({ model: "deepseek-v4-flash" })],
    ["gemini", gemini({ model: "gemini-flash-latest" })],
    ["together", together({ model: "meta-llama/Llama-3.3-70B-Instruct-Turbo" })],
    ["cerebras", cerebras({ model: "gpt-oss-120b" })],
    ["grok", grok({ model: "grok-4.5" })],
    ["openaiCompatible", openaiCompatible({ baseURL: "https://api.example.com/v1", apiKey: "test-key", model: "test-model" })],
    ["llamaCpp", llamaCpp({ modelPath: "/nonexistent/model.gguf" })],
  ])("%s: declares capabilities, chat() and generate()", (_name, model) => {
    expect(model.capabilities).toBeDefined();
    expect(typeof model.generate).toBe("function");
    expect(typeof model.chat).toBe("function");
    expect(model.capabilities?.chat).toBe(true);
    expect(model.capabilities?.skillDispatch).toBe(true);
    expect(model.id).toBeTruthy();
  });

  it.each([
    ["openai", openai({ model: "gpt-4o-mini" })],
    ["groq", groq({ model: "llama-3.3-70b-versatile" })],
    ["anthropic", anthropic({ model: "claude-haiku-4-5-20251001" })],
    ["ollama", ollama({ model: "llama3.2" })],
    ["fireworks", fireworks({ model: "accounts/fireworks/models/llama-v3p1-70b-instruct" })],
    ["mistral", mistral({ model: "mistral-large-latest" })],
    ["openRouter", openRouter({ model: "openai/gpt-4o-mini" })],
    ["gemini", gemini({ model: "gemini-flash-latest" })],
    ["deepseek", deepseek({ model: "deepseek-v4-flash" })],
    ["together", together({ model: "meta-llama/Llama-3.3-70B-Instruct-Turbo" })],
    ["cerebras", cerebras({ model: "gpt-oss-120b" })],
    ["grok", grok({ model: "grok-4.5" })],
    ["openaiCompatible", openaiCompatible({ baseURL: "https://api.example.com/v1", apiKey: "test-key", model: "test-model" })],
  ])("%s's declared capabilities match its actual duck-typed method presence", (_name, model) => {
    expect(model.capabilities?.streaming).toBe(typeof model.generateStream === "function");
    expect(model.capabilities?.chat).toBe(typeof model.chat === "function");
  });

  it("openRouter() reports best-effort, not native - pass-through across many underlying models means json_schema enforcement isn't guaranteed for all of them", () => {
    expect(openRouter({ model: "openai/gpt-4o-mini" }).guaranteeLevel).toBe("best-effort");
  });

  it("gemini() reports native - responseSchema/responseJsonSchema is server-side constrained decoding, same tier as openai()/groq()", () => {
    expect(gemini({ model: "gemini-flash-latest" }).guaranteeLevel).toBe("native");
  });

  it("deepseek() reports native - response_format: json_object is a real server-side JSON-mode toggle, same tier as groq() - but DeepSeek has no json_schema mode, unlike fireworks()/mistral()", () => {
    expect(deepseek({ model: "deepseek-v4-flash" }).guaranteeLevel).toBe("native");
  });

  describe("deepseek() missing-key guard", () => {
    afterEach(() => vi.unstubAllEnvs());

    // Regression guard: the openai package falls back to reading OPENAI_API_KEY
    // itself when apiKey is undefined (not just omitted) - without this guard,
    // an unconfigured deepseek() would silently authenticate against DeepSeek's
    // endpoint using an unrelated OpenAI key instead of failing clearly.
    it("throws a clear error instead of silently falling back to OPENAI_API_KEY", async () => {
      vi.stubEnv("DEEPSEEK_API_KEY", "");
      vi.stubEnv("OPENAI_API_KEY", "sk-unrelated-openai-key");

      await expect(generate(deepseek({ model: "deepseek-v4-flash" }), PersonSchema, "extract data")).rejects.toThrow(
        /Missing DeepSeek API key/
      );
    });
  });

  it("together() reports native - response_format: json_schema is server-side enforced, same tier as openai()/groq()/fireworks()/mistral()", () => {
    expect(together({ model: "meta-llama/Llama-3.3-70B-Instruct-Turbo" }).guaranteeLevel).toBe("native");
  });

  it("cerebras() reports native - strict json_schema mode is server-side enforced, same tier as openai()/groq()/fireworks()/mistral()/together()", () => {
    expect(cerebras({ model: "gpt-oss-120b" }).guaranteeLevel).toBe("native");
  });

  it("grok() reports native - json_schema mode is server-side enforced, same tier as openai()/groq()/fireworks()/mistral()/together()/cerebras()", () => {
    expect(grok({ model: "grok-4.5" }).guaranteeLevel).toBe("native");
  });

  describe("together()/cerebras()/grok() missing-key guards", () => {
    afterEach(() => vi.unstubAllEnvs());

    // Same regression class as deepseek()'s guard above - the openai package
    // falls back to reading OPENAI_API_KEY itself when apiKey is undefined.
    it("together() throws instead of silently falling back to OPENAI_API_KEY", async () => {
      vi.stubEnv("TOGETHER_API_KEY", "");
      vi.stubEnv("OPENAI_API_KEY", "sk-unrelated-openai-key");
      await expect(
        generate(together({ model: "meta-llama/Llama-3.3-70B-Instruct-Turbo" }), PersonSchema, "extract data")
      ).rejects.toThrow(/Missing Together API key/);
    });

    it("cerebras() throws instead of silently falling back to OPENAI_API_KEY", async () => {
      vi.stubEnv("CEREBRAS_API_KEY", "");
      vi.stubEnv("OPENAI_API_KEY", "sk-unrelated-openai-key");
      await expect(generate(cerebras({ model: "gpt-oss-120b" }), PersonSchema, "extract data")).rejects.toThrow(
        /Missing Cerebras API key/
      );
    });

    it("grok() throws instead of silently falling back to OPENAI_API_KEY", async () => {
      vi.stubEnv("XAI_API_KEY", "");
      vi.stubEnv("OPENAI_API_KEY", "sk-unrelated-openai-key");
      await expect(generate(grok({ model: "grok-4.5" }), PersonSchema, "extract data")).rejects.toThrow(/Missing xAI API key/);
    });
  });

  describe("openaiCompatible()", () => {
    it("defaults to best-effort - shapecraft can't verify an arbitrary endpoint enforces json_schema server-side", () => {
      expect(openaiCompatible({ baseURL: "https://api.example.com/v1", apiKey: "test-key", model: "test-model" }).guaranteeLevel).toBe(
        "best-effort"
      );
    });

    it("accepts an explicit guaranteeLevel override for a caller who knows their provider enforces json_schema", () => {
      expect(
        openaiCompatible({ baseURL: "https://api.example.com/v1", apiKey: "test-key", model: "test-model", guaranteeLevel: "native" })
          .guaranteeLevel
      ).toBe("native");
    });

    // No env-var fallback exists for an arbitrary provider, so apiKey must be
    // required at the type level - this confirms the runtime guard fires too
    // (e.g. a caller passing an empty string through at runtime despite the type).
    it("throws a clear error when apiKey is empty, rather than silently falling back to OPENAI_API_KEY", async () => {
      await expect(
        generate(openaiCompatible({ baseURL: "https://api.example.com/v1", apiKey: "", model: "test-model" }), PersonSchema, "extract data")
      ).rejects.toThrow(/openaiCompatible\(\) requires \{ apiKey \}/);
    });
  });

  it("is optional — a pre-existing custom ShapecraftModel without capabilities still satisfies the interface and works", async () => {
    const legacy = mockModel({ name: "Alice", age: 30 });
    expect(legacy.capabilities).toBeUndefined();

    const result = await generate(legacy, PersonSchema, "get person");
    expect(result.data).toEqual({ name: "Alice", age: 30 });
  });
});

const hasMistral = !!process.env.MISTRAL_API_KEY;

// Regression guard: caught live while dogfood-testing mistral() - despite
// response_format: { type: "json_schema" } supposedly enforcing raw JSON,
// mistral-large-latest sometimes wraps the output in a ```json fence anyway.
// Without extractJson: true in mistral.ts's generate(), that fails JSON.parse
// outright and burns all 3 retries before MaxRetriesExceededError.
describe("Mistral backend (real API)", () => {
  it.skipIf(!hasMistral)("survives a markdown-fence-wrapped json_schema response", async () => {
    const model = mistral({ model: "mistral-large-latest" });
    const result = await generate(
      model,
      z.object({ name: z.string(), age: z.number(), email: z.string() }),
      "Jane Doe is 34 years old, email jane.doe@example.com"
    );
    expect(result.data).toEqual({ name: "Jane Doe", age: 34, email: "jane.doe@example.com" });
  }, 30_000);
});
