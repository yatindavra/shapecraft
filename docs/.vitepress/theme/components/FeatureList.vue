<script setup lang="ts">
interface Feature {
  level?: "native" | "constrained" | "best-effort";
  title: string;
  description: string;
}

defineProps<{ items: Feature[] }>();
</script>

<template>
  <div class="sc-feature-grid">
    <div v-for="item in items" :key="item.title" class="sc-feature-card">
      <span v-if="item.level" class="sc-pill" :class="`sc-pill-${item.level}`">{{
        item.level
      }}</span>
      <h3 class="sc-feature-title">{{ item.title }}</h3>
      <p class="sc-feature-desc">{{ item.description }}</p>
    </div>
  </div>
</template>

<style scoped>
.sc-feature-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--sc-space-md);
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 var(--sc-space-lg);
}

@media (min-width: 720px) {
  .sc-feature-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1080px) {
  .sc-feature-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.sc-feature-card {
  background: var(--sc-surface-1);
  border: 1px solid var(--sc-hairline);
  border-radius: var(--sc-radius-lg);
  padding: var(--sc-space-lg);
}

.sc-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: var(--sc-radius-pill);
  font-size: 12px;
  font-weight: 600;
  margin-bottom: var(--sc-space-xs);
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

.sc-feature-title {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.2px;
  color: var(--sc-ink);
  margin: 0 0 var(--sc-space-xxs);
}

.sc-feature-desc {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.71;
  color: var(--sc-ink-muted);
  margin: 0;
}
</style>
