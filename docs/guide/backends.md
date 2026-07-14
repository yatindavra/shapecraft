# Backends & Guarantee Levels

| Backend | Guarantee | Mechanism |
|---|---|---|
| `openai()` | `native` | Server-side strict JSON schema |
| `groq()` | `native` | JSON mode |
| `fireworks()` | `native` | Server-side JSON schema mode, plus a real token-level GBNF grammar mode |
| `mistral()` | `native` | Server-side JSON schema mode |
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

```typescript
import { openai, groq, fireworks, mistral, openRouter, ollama, anthropic, llamaCpp } from "@aviasole/shapecraft";

const gpt       = openai({ model: "gpt-4o-mini" });
const fast      = groq({ model: "llama-3.3-70b-versatile" });
const cloudGbnf = fireworks({ model: "accounts/fireworks/models/llama-v3p1-70b-instruct" });
const mist      = mistral({ model: "mistral-large-latest" });
const router    = openRouter({ model: "openai/gpt-4o-mini" });
const local     = ollama({ model: "llama3.2" });
const native    = llamaCpp({ modelPath: "./models/llama-3.2-3b.gguf" });
const claude    = anthropic({ model: "claude-haiku-4-5-20251001", maxRetries: 3 });
```

## Model Capabilities

Every built-in backend also exposes `capabilities` - an explicit, inspectable alternative to duck-typing `typeof model.generateStream === "function"` for routing logic:

```typescript
console.log(claude.capabilities);
// { streaming: true, chat: true, structuredOutput: true, toolCalling: false }
```

```typescript
interface ModelCapabilities {
  streaming: boolean;       // has generateStream()
  chat: boolean;            // has chat() - required for turnaround: true
  structuredOutput: boolean; // has generate() - always true
  toolCalling: boolean;     // not yet supported by any backend
}
```

`capabilities` is optional on `ShapecraftModel` - a custom model implementation that predates this field (or simply doesn't set it) still satisfies the interface unchanged, and `model.capabilities` is `undefined` for it. `chat?`/`generateStream?` remain the actual methods the core calls; `capabilities` is just a declared summary of the same information, not a replacement mechanism.
