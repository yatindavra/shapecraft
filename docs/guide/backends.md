# Backends & Guarantee Levels

| Backend | Guarantee | Mechanism |
|---|---|---|
| `openai()` | `native` | Server-side strict JSON schema |
| `groq()` | `native` | JSON mode |
| `deepseek()` | `native` | JSON mode (no schema-strict mode, same tier as `groq()`) |
| `fireworks()` | `native` | Server-side JSON schema mode, plus a real token-level GBNF grammar mode |
| `mistral()` | `native` | Server-side JSON schema mode |
| `gemini()` | `native` | Server-side JSON schema mode (`responseJsonSchema`) |
| `ollama()` | `constrained` | Token-level JSON-schema constraint |
| `llamaCpp()` | `constrained` | Token-level GBNF grammar (local `.gguf` via node-llama-cpp) |
| `anthropic()` | `best-effort` | Prompt + parse + retry |
| `openRouter()` | `best-effort` | Pass-through to many providers - `response_format` support varies by underlying model |

> `llamaCpp()` is `constrained` for a `{ gbnf }` input (token-level). For other schema
> types (Zod / jsonSchema / …) it currently runs a best-effort prompt path until the
> JSON-Schema→GBNF converter lands - treat those as best-effort despite the nominal level.
>
> `fireworks()` is the one cloud backend where a `{ gbnf }` input is *not* downgraded to
> best-effort - Fireworks' grammar mode (`response_format: { type: "grammar", grammar }`)
> applies the GBNF grammar as a genuine token-level constraint server-side, the same
> guarantee `llamaCpp()` gives locally. It reuses the `openai` package pointed at
> Fireworks' base URL, so no extra SDK dependency is needed.
>
> `openRouter()` is deliberately `best-effort`, not `native` like the other cloud
> backends - it's pass-through across many different underlying providers/models, and
> `response_format: { type: "json_schema" }` enforcement isn't guaranteed for every model
> it can route to, only the ones that actually support it themselves.
>
> `gemini()` uses the official `@google/genai` SDK, not an OpenAI-compatible endpoint
> (unlike `fireworks()`/`mistral()`/`openRouter()`) - Gemini's OpenAI-compat layer is a
> migration bridge for OpenAI users, not its primary integration path, and doesn't expose
> `responseJsonSchema` (plain JSON Schema, what `toJsonSchema()` already produces) - only
> the older `responseSchema` (Gemini's own Type-enum OpenAPI-subset shape).

```typescript
import { openai, groq, fireworks, mistral, gemini, openRouter, deepseek, ollama, anthropic, llamaCpp } from "@aviasole/shapecraft";

const gpt       = openai({ model: "gpt-4o-mini" });
const fast      = groq({ model: "llama-3.3-70b-versatile" });
const cloudGbnf = fireworks({ model: "accounts/fireworks/models/llama-v3p1-70b-instruct" });
const mist      = mistral({ model: "mistral-large-latest" });
const gem       = gemini({ model: "gemini-flash-latest" });
const router    = openRouter({ model: "openai/gpt-4o-mini" });
const deep      = deepseek({ model: "deepseek-v4-flash" });
const local     = ollama({ model: "llama3.2" });
const native    = llamaCpp({ modelPath: "./models/llama-3.2-3b.gguf" });
const claude    = anthropic({ model: "claude-haiku-4-5-20251001", maxRetries: 3 });
```

## Model Capabilities

Every built-in backend also exposes `capabilities` - an explicit, inspectable alternative to duck-typing `typeof model.generateStream === "function"` for routing logic:

```typescript
console.log(claude.capabilities);
// { streaming: true, chat: true, structuredOutput: true, toolCalling: true, skillDispatch: true }
```

```typescript
interface ModelCapabilities {
  streaming: boolean;        // has generateStream()
  chat: boolean;             // has chat() - required for turnaround: true
  structuredOutput: boolean; // has generate() - always true
  toolCalling: boolean;      // native provider function-calling, drives generateWithTools() -
                              // true wherever the backend implements toolCall(); llamaCpp() is
                              // the one backend without it (local GGUF exposes no tools API)
  skillDispatch: boolean;    // generateSkillCall()/runSkillLoop() - always true, built on generate()
}
```

`capabilities` is optional on `ShapecraftModel` - a custom model implementation that predates this field (or simply doesn't set it) still satisfies the interface unchanged, and `model.capabilities` is `undefined` for it. `chat?`/`generateStream?` remain the actual methods the core calls; `capabilities` is just a declared summary of the same information, not a replacement mechanism.

See [Tool Calling](/guide/tool-calling) for `toolCalling`/`generateWithTools()`, and [Skill-Based Generation](/guide/skill-based-generation) for `skillDispatch`.
