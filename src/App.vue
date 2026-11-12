<script setup lang="ts">
const version = '0.1.0';
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <span class="brand__mark">琴</span>
        <div class="brand__text">
          <strong>琴习</strong>
          <em>QinXi</em>
        </div>
      </div>
      <span class="version">v{{ version }}</span>
    </header>

    <main class="main">
      <h1>脚手架就绪</h1>
      <p>Vue 3 + Vite + TypeScript + Vitest 已初始化，钢琴功能将在后续分支中实现。</p>
    </main>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px clamp(16px, 4vw, 44px);
  border-bottom: 1px solid rgba(43, 29, 25, 0.08);
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand__mark {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: linear-gradient(160deg, #43302a, #241a17);
  color: #f3e3c3;
  font-family: 'Songti SC', 'Noto Serif SC', serif;
  font-size: 20px;
}

.brand__text {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.brand__text strong {
  font-size: 18px;
  letter-spacing: 0.08em;
}

.brand__text em {
  font-style: normal;
  font-size: 12px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(43, 29, 25, 0.45);
}

.version {
  font-size: 12px;
  color: rgba(43, 29, 25, 0.4);
}

.main {
  max-width: 1360px;
  margin: 0 auto;
  padding: clamp(24px, 4vw, 48px) clamp(16px, 4vw, 44px);
}

.main h1 {
  margin: 0 0 8px;
  font-size: 24px;
}

.main p {
  margin: 0;
  color: rgba(43, 29, 25, 0.55);
  font-size: 14px;
}
</style>
