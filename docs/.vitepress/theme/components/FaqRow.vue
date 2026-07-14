<script setup lang="ts">
import { ref } from "vue";

defineProps<{ question: string }>();
const open = ref(false);
</script>

<template>
  <div class="sc-faq-row" @click="open = !open">
    <div class="sc-faq-question">
      <span class="sc-faq-marker">{{ open ? "&minus;" : "+" }}</span>
      {{ question }}
    </div>
    <div v-show="open" class="sc-faq-answer">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.sc-faq-row {
  padding: var(--sc-space-sm) 0;
  border-bottom: 1px solid var(--sc-hairline-soft);
  cursor: pointer;
}

.sc-faq-question {
  display: flex;
  align-items: center;
  gap: var(--sc-space-sm);
  color: var(--sc-ink);
  font-size: 16px;
  font-weight: 600;
}

.sc-faq-marker {
  width: 1.5em;
  text-align: center;
  color: var(--sc-accent-blue);
}

.sc-faq-answer {
  margin-top: var(--sc-space-xs);
  margin-left: calc(1.5em + var(--sc-space-sm));
  color: var(--sc-ink-muted);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.71;
}
</style>
