---
layout: page
---

<script setup>
const backends = [
  { level: 'native', title: 'openai()', description: 'Server-side strict JSON schema enforcement' },
  { level: 'native', title: 'groq()', description: 'JSON mode' },
  { level: 'native', title: 'fireworks()', description: 'Grammar-based cloud constraint' },
  { level: 'native', title: 'mistral()', description: 'JSON mode' },
  { level: 'constrained', title: 'ollama()', description: 'GBNF grammar, token-level' },
  { level: 'constrained', title: 'node-llama-cpp()', description: 'GBNF grammar, token-level, fully local' },
  { level: 'best-effort', title: 'anthropic()', description: 'Prompt + parse + retry' },
  { level: 'best-effort', title: 'openRouter()', description: 'Pass-through, depends on underlying model' },
]

const capabilities = [
  { title: 'Streaming', description: 'Incremental JSON parsing with partial-object events' },
  { title: 'createClient() middleware', description: 'Koa-style pipeline for logging, retry, timeout defaults' },
  { title: 'Batch generation', description: 'Concurrency-capped generateBatch() across many prompts' },
  { title: 'FHIR R4 presets', description: 'Patient, Observation, Condition, MedicationRequest, Encounter' },
  { title: 'Skill-based generation', description: 'Model dispatches to registered skills, agentic loop support' },
  { title: 'CLI', description: 'npx shapecraft validate - check a JSON file against a schema, no code' },
]
</script>

<Hero />

<InstallSnippet />

<section class="sc-section">
  <span class="sc-eyebrow">Backends</span>
  <h2 class="sc-section-title">Guarantee levels</h2>
  <FeatureList :items="backends" />
</section>

<section class="sc-section">
  <span class="sc-eyebrow">Also included</span>
  <h2 class="sc-section-title">What else is in the box</h2>
  <FeatureList :items="capabilities" />
</section>

<section class="sc-section sc-section-narrow">
  <span class="sc-eyebrow">FAQ</span>
  <h2 class="sc-section-title">Common questions</h2>
  <FaqRow question="What does a guarantee level actually guarantee?">
    Structural correctness only - valid JSON, correct types, required fields present. Not semantic
    correctness. A model can still return a valid-but-fabricated value; layer a semantic validator
    on top if you need that.
  </FaqRow>
  <FaqRow question="Do I need to install every backend's SDK?">
    No - each backend's SDK (openai, groq-sdk, @anthropic-ai/sdk, node-llama-cpp, ollama) is an
    optional peer dependency. Install only the ones you use.
  </FaqRow>
  <FaqRow question="Can I bring my own JSON Schema validator?">
    Yes - <code>jsonSchemaValidator</code> is pluggable on both <code>generate()</code> and
    <code>createClient()</code>, defaulting to the built-in shallow checker.
  </FaqRow>
</section>

<style>
.sc-section {
  max-width: 1280px;
  margin: 0 auto;
  padding: var(--sc-space-xxl) var(--sc-space-lg) 0;
}

@media (min-width: 768px) {
  .sc-section {
    padding-top: 64px;
  }
}

@media (min-width: 1024px) {
  .sc-section {
    padding-top: var(--sc-space-section);
  }
}

.sc-section-narrow {
  max-width: 720px;
}

.sc-eyebrow {
  display: block;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--sc-ink-muted);
  margin-bottom: var(--sc-space-xxs);
}

.sc-section-title {
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.6px;
  color: var(--sc-ink);
  margin: 0 0 var(--sc-space-lg);
}

.sc-section:last-child {
  padding-bottom: var(--sc-space-section);
}
</style>
