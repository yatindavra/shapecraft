/**
 * A `ShapecraftModel` test double — a separate, tree-shakeable entrypoint.
 *
 *   import { mockModel } from "@aviasole/shapecraft/testing";
 *   import { generate } from "@aviasole/shapecraft";
 *
 *   const model = mockModel({ name: "Alice", age: 30 });
 *   const { data } = await generate(model, PersonSchema, "extract data");
 *
 * For testing code built on shapecraft (retry handling, error branches,
 * turnaround loops) without calling a real provider.
 */
import type { ChatMessage, GuaranteeLevel, ModelCapabilities, ShapecraftModel } from "../types.js";
import { SchemaViolationError } from "../types.js";

export interface MockModelOptions {
  id?: string;
  guaranteeLevel?: GuaranteeLevel;
  capabilities?: ModelCapabilities;
  /** Enables `chat()` (required for `turnaround: true`) — omit to leave it unset. */
  chat?: (messages: ChatMessage[], systemPrompt?: string) => string | Promise<string>;
}

type MockResponse<T> = T | Error;

/**
 * `responses` is a single value (returned on every call) or an array consumed
 * one per `generate()`/`generateStream()` call and held at the last entry once
 * exhausted — the shape needed for "fail twice, then succeed" retry tests. Any
 * entry that's an `Error` instance is thrown instead of returned.
 */
export function mockModel<T = unknown>(
  responses: MockResponse<T> | MockResponse<T>[],
  options: MockModelOptions = {}
): ShapecraftModel {
  const queue = Array.isArray(responses) ? responses : [responses];
  let calls = 0;

  async function next(): Promise<T> {
    const entry = queue[Math.min(calls, queue.length - 1)];
    calls++;
    if (entry instanceof Error) throw entry;
    return entry;
  }

  const model: ShapecraftModel = {
    id: options.id ?? "mock:test",
    guaranteeLevel: options.guaranteeLevel ?? "constrained",
    async generate<U>(): Promise<U> {
      return (await next()) as unknown as U;
    },
    async *generateStream(): AsyncIterable<string> {
      const value = await next();
      yield JSON.stringify(value);
    },
  };

  if (options.capabilities) model.capabilities = options.capabilities;
  if (options.chat) {
    const chat = options.chat;
    model.chat = async (messages, systemPrompt) => chat(messages, systemPrompt);
  }

  return model;
}

/** A mock that always throws `SchemaViolationError` — for testing retry exhaustion / `MaxRetriesExceededError` paths. */
export function mockModelThatFails(raw = "bad output", validationErrors: unknown = "invalid"): ShapecraftModel {
  return mockModel(new SchemaViolationError(raw, validationErrors));
}
