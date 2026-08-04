/**
 * Example: Native tool calling - the model requests a tool, gets the result,
 * then answers. Uses the provider's own tool-calling API (OpenAI/Groq/
 * Anthropic/Ollama each have a different wire shape under the hood), not
 * shapecraft's own prompted skill-dispatch mechanism.
 */
import { generateWithTools, anthropic } from "@aviasole/shapecraft";
import { z } from "zod";
import type { ToolDefinition } from "@aviasole/shapecraft";

const model = anthropic({ model: "claude-haiku-4-5-20251001" });

const getWeather: ToolDefinition = {
  name: "get_weather",
  description: "Get current weather for a city",
  parameters: z.object({ city: z.string() }),
  handler: async ({ city }: { city: string }) => {
    // A real handler would call a real weather API - hardcoded here for the example.
    return { city, tempC: 18, condition: "cloudy" };
  },
};

const result = await generateWithTools(
  model,
  [getWeather],
  z.object({ summary: z.string() }),
  "What's the weather in Lisbon? Use the get_weather tool, then summarize it in one sentence."
);

console.log(result.data); // { summary: "It's 18°C and cloudy in Lisbon." }
console.log(result.toolCalls); // [{ type: "tool-call", call: { name: "get_weather", args: { city: "Lisbon" } }, result: { city: "Lisbon", tempC: 18, condition: "cloudy" } }]
