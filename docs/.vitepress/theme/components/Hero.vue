<script setup lang="ts">
import { withBase } from "vitepress";

const code = `import { z } from "zod";
import { generate, openai } from "@aviasole/shapecraft";

const Person = z.object({
  name: z.string(),
  age: z.number(),
});

const result = await generate(
  openai({ model: "gpt-4o-mini" }),
  Person,
  "John Doe is 32"
);

result.data
// { name: "John Doe", age: 32 }
result.guaranteeLevel
// "native"`;
</script>

<template>
  <section class="sc-hero">
    <div class="sc-hero-text">
      <img
        class="sc-hero-logo sc-hero-logo-light"
        :src="withBase('/logo-light-64.png')"
        alt="shapecraft"
        width="40"
        height="40"
      />
      <img
        class="sc-hero-logo sc-hero-logo-dark"
        :src="withBase('/logo-dark-64.png')"
        alt="shapecraft"
        width="40"
        height="40"
      />
      <span class="sc-eyebrow">Structured output for LLMs</span>
      <h1 class="sc-hero-title">Reliable structured AI runtime for Node.js</h1>
      <p class="sc-hero-sub">
        Token-level constraints for local models, native JSON modes for cloud APIs - one unified
        API with explicit guarantee levels, not silent best-effort parsing.
      </p>
      <div class="sc-hero-actions">
        <a class="sc-btn-primary" :href="withBase('/guide/getting-started')">Read docs &rarr;</a>
        <a class="sc-btn-secondary" href="https://github.com/aviasoletechnologies/shapecraft"
          >GitHub</a
        >
      </div>
    </div>

    <div class="sc-code-card">
      <div class="sc-code-titlebar">
        <span class="sc-pill sc-pill-native">native</span>
        shapecraft
      </div>
      <pre class="sc-code-block"><code>{{ code }}</code></pre>
    </div>
  </section>
</template>

<style scoped>
.sc-hero {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--sc-space-xl);
  max-width: 1280px;
  margin: 0 auto;
  padding: var(--sc-space-xl) var(--sc-space-lg) 0;
}

@media (min-width: 960px) {
  .sc-hero {
    grid-template-columns: 1fr 1fr;
    align-items: center;
    padding-top: var(--sc-space-section);
  }
}

.sc-hero-logo {
  display: block;
  margin-bottom: var(--sc-space-md);
}

.sc-eyebrow {
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--sc-ink-muted);
  margin-bottom: var(--sc-space-sm);
}

.sc-hero-title {
  font-size: 34px;
  font-weight: 700;
  line-height: 1.19;
  letter-spacing: -1.0px;
  color: var(--sc-ink);
  margin: 0 0 var(--sc-space-md);
}

@media (min-width: 640px) {
  .sc-hero-title {
    font-size: 40px;
    letter-spacing: -1.0px;
  }
}

@media (min-width: 960px) {
  .sc-hero-title {
    font-size: 56px;
    line-height: 1.18;
    letter-spacing: -1.6px;
  }
}

.sc-hero-sub {
  font-size: 18px;
  font-weight: 500;
  line-height: 1.69;
  color: var(--sc-ink-muted);
  margin: 0 0 var(--sc-space-lg);
  max-width: 52ch;
}

.sc-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sc-space-sm);
}

.sc-btn-primary,
.sc-btn-secondary {
  display: inline-flex;
  align-items: center;
  padding: 10px 18px;
  border-radius: var(--sc-radius-md);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.29;
  text-decoration: none;
}

.sc-btn-primary {
  background: var(--sc-inverse-canvas);
  color: var(--sc-inverse-ink);
}

.sc-btn-secondary {
  background: var(--sc-surface-2);
  color: var(--sc-ink);
}

.sc-code-card {
  background: var(--sc-surface-1);
  border: 1px solid var(--sc-hairline);
  border-radius: var(--sc-radius-lg);
  padding: var(--sc-space-lg);
}

.sc-code-titlebar {
  display: flex;
  align-items: center;
  gap: var(--sc-space-sm);
  color: var(--sc-ink-muted);
  font-size: 13px;
  font-weight: 500;
  margin-bottom: var(--sc-space-md);
}

.sc-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: var(--sc-radius-pill);
  font-size: 12px;
  font-weight: 600;
}

.sc-pill-native {
  background: rgba(0, 202, 142, 0.15);
  color: var(--sc-level-native);
}

.sc-pill-constrained {
  background: rgba(255, 207, 37, 0.15);
  color: var(--sc-level-constrained);
}

.sc-pill-best-effort {
  background: rgba(43, 137, 255, 0.15);
  color: var(--sc-level-best-effort);
}

.sc-code-block {
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 1.6;
  color: var(--sc-ink);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  overflow-x: auto;
}
</style>
