export { generate } from "./core/generate.js";
export { generateStream } from "./core/stream.js";
export { generateBatch } from "./core/batch.js";
export { toJsonSchema, buildStructuredPrompt } from "./core/schema.js";
export { xmlType, validateXmlTemplate } from "./core/xml.js";
export { parseGbnf, matchesGbnf, buildGbnfSystemPrompt } from "./core/gbnf.js";
export { createConversationMemory, COMPLETION_SENTINEL } from "./core/turnaround.js";
export { createClient } from "./core/client.js";
export { exponentialBackoff } from "./core/retry.js";
export { cascade } from "./core/cascade.js";
export { composeMiddleware, loggingMiddleware, responseCacheMiddleware } from "./core/middleware.js";
export { checkJsonSchema, runValidationPipeline } from "./core/validate.js";

export * from "./backends/index.js";

export type {
  ShapecraftModel,
  ModelCallOptions,
  ModelCapabilities,
  SchemaInput,
  GenerateOptions,
  GenerateResult,
  ResultMetadata,
  JsonSchemaValidator,
  SemanticValidator,
  ConfidenceScorer,
  PostProcessor,
  GuaranteeLevel,
  XmlInput,
  GbnfInput,
  ChatMessage,
  ConversationMemory,
  TurnaroundOptions,
  TurnResult,
  StreamEvent,
  StreamHandle,
  BatchItem,
  BatchResult,
  GenerateBatchOptions,
} from "./types.js";

export type { CreateClientOptions, ShapecraftClient } from "./core/client.js";
export type { BackoffOptions } from "./core/retry.js";
export type { CascadeOptions } from "./core/cascade.js";
export type { Middleware, MiddlewareContext, NextFn, ResponseCacheOptions } from "./core/middleware.js";
export type { ValidationPipelineOptions, ValidationPipelineResult } from "./core/validate.js";

export { SchemaViolationError, MaxRetriesExceededError, MaxTurnsExceededError, TimeoutError } from "./types.js";
