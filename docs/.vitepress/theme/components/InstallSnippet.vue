<script setup lang="ts">
import { ref } from "vue";

const props = withDefaults(defineProps<{ command?: string }>(), {
  command: "npm install @aviasole/shapecraft",
});

const copied = ref(false);

function fallbackCopy(text: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

async function copy() {
  // navigator.clipboard requires a secure context (HTTPS or localhost) - it's
  // silently undefined when the docs are served over a plain-HTTP network IP,
  // so fall back to the legacy execCommand approach in that case.
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(props.command);
    } else {
      fallbackCopy(props.command);
    }
  } catch {
    fallbackCopy(props.command);
  }
  copied.value = true;
  setTimeout(() => (copied.value = false), 1500);
}
</script>

<template>
  <div class="sc-install">
    <code>{{ command }}</code>
    <button class="sc-install-copy" type="button" @click="copy">
      {{ copied ? "copied" : "copy" }}
    </button>
  </div>
</template>

<style scoped>
.sc-install {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sc-space-sm);
  background: var(--sc-surface-1);
  border: 1px solid var(--sc-hairline);
  color: var(--sc-ink);
  padding: var(--sc-space-sm) var(--sc-space-md);
  border-radius: var(--sc-radius-md);
  font-size: 14px;
  max-width: 640px;
  margin: var(--sc-space-lg) var(--sc-space-lg);
}

@media (min-width: 720px) {
  .sc-install {
    margin: var(--sc-space-lg) auto;
  }
}

.sc-install code {
  background: transparent;
  padding: 0;
  font-family: var(--vp-font-family-mono);
  overflow-x: auto;
  white-space: nowrap;
  min-width: 0;
}

.sc-install-copy {
  background: var(--sc-surface-2);
  border: none;
  border-radius: var(--sc-radius-sm);
  color: var(--sc-ink-muted);
  font-family: var(--sc-font-sans);
  font-size: 13px;
  font-weight: 600;
  padding: 4px 12px;
  cursor: pointer;
  flex-shrink: 0;
}

.sc-install-copy:hover {
  color: var(--sc-ink);
  background: var(--sc-surface-3);
}
</style>
