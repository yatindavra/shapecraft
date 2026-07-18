import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { SchemaInput, ValidatorInput } from "../types.js";
import { buildXmlSystemPrompt } from "./xml.js";
import { buildGbnfSystemPrompt } from "./gbnf.js";
import { isXmlInput, isGbnfInput, isZodSchema } from "./validate.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toJsonSchema(schema: z.ZodType<any>): Record<string, unknown> {
  // zod-to-json-schema (last updated for Zod v3's internal shape) silently
  // returns an essentially-empty schema ({ $schema: ... }, no properties/type
  // at all) for a v4 schema instead of erroring - it doesn't recognize v4's
  // reworked internals at all. Confirmed live: this caused two different
  // Zod schemas to collapse to the same (empty) JSON, producing a false
  // cache-key collision in responseCacheMiddleware. Zod v4 ships its own
  // native z.toJSONSchema(), which reads the schema's own shape directly.
  //
  // zod is an optional peerDependency (">=3.0.0"), so a consumer's schema may
  // have been built by a *different* zod install than the one bundled here
  // (dual-package hazard). z4.toJSONSchema() throws on a v3-built schema even
  // though our bundled zod is v4, so detect the schema instance's own
  // version via its "_zod" marker (present only on v4-built schemas) instead
  // of trusting which zod happens to be bundled.
  const isV4Schema = typeof schema === "object" && schema !== null && "_zod" in schema;
  const zModule = z as unknown as { toJSONSchema?: (s: unknown) => Record<string, unknown> };
  if (isV4Schema && typeof zModule.toJSONSchema === "function") {
    return zModule.toJSONSchema(schema);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return zodToJsonSchema(schema as any, { target: "openApi3" }) as Record<string, unknown>;
}

export function buildStructuredPrompt(
  prompt: string,
  schema: SchemaInput,
  systemPrompt?: string
): { system: string; user: string } {
  let schemaInfo: string;

  if (isZodSchema(schema)) {
    schemaInfo = `Respond with valid JSON matching this schema exactly:\n\n${JSON.stringify(toJsonSchema(schema), null, 2)}`;
  } else if ("jsonSchema" in schema) {
    schemaInfo = `Respond with valid JSON matching this schema exactly:\n\n${JSON.stringify(schema.jsonSchema, null, 2)}`;
  } else if ("pattern" in schema) {
    schemaInfo = `Respond with a plain string matching this pattern: ${schema.pattern}`;
  } else if (isGbnfInput(schema)) {
    schemaInfo = buildGbnfSystemPrompt(schema);
  } else if (isXmlInput(schema)) {
    schemaInfo = buildXmlSystemPrompt(schema);
  } else if ("validate" in schema && (schema as ValidatorInput).hint) {
    schemaInfo = `Respond with valid JSON matching this schema exactly:\n\n${JSON.stringify((schema as ValidatorInput).hint, null, 2)}`;
  } else {
    schemaInfo = "Respond with valid JSON. No extra text, no markdown.";
  }

  const system = systemPrompt
    ? `${systemPrompt}\n\n${schemaInfo} No extra text, no markdown, no explanation.`
    : `You are a precise assistant. ${schemaInfo} No extra text, no markdown, no explanation.`;

  return { system, user: prompt };
}
