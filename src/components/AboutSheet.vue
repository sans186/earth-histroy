<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { useUiStore } from '@/stores/ui';

const emit = defineEmits<{ close: [] }>();

const ui = useUiStore();

const REPO = 'https://github.com/sans186/earth-histroy';
const DOCS = {
  ai: `${REPO}/blob/main/docs/ai-generated-fields.json`,
  openSource: `${REPO}/blob/main/docs/%E5%BC%80%E6%BA%90%E8%AF%B4%E6%98%8E.md`,
  issues: `${REPO}/issues/new`,
};

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <aside class="sheet" role="dialog" aria-modal="true" :aria-label="ui.t('about.title')">
      <header>
        <div class="left">
          <span class="cap">{{ ui.t('nav.about') }}</span>
          <h2>{{ ui.t('about.title') }}</h2>
        </div>
        <button class="close" :aria-label="ui.t('story.close')" @click="emit('close')">✕</button>
      </header>

      <div class="body">
        <section>
          <h3 class="cap">{{ ui.t('about.data.title') }}</h3>
          <p>{{ ui.t('about.data.body') }}</p>
          <ul class="links">
            <li>
              <a href="https://github.com/Magnussmari/chronograph" target="_blank" rel="noopener">
                Chronograph
              </a>
              <span class="lic mono">CC BY 4.0</span>
            </li>
            <li>
              <a
                href="https://github.com/Seshat-Global-History-Databank/cliopatria"
                target="_blank"
                rel="noopener"
              >
                Seshat / Cliopatria
              </a>
              <span class="lic mono">CC BY 4.0</span>
            </li>
            <li>
              <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">
                Natural Earth
              </a>
              <span class="lic mono">Public Domain</span>
            </li>
            <li>
              <a href="https://www.wikipedia.org/" target="_blank" rel="noopener">Wikipedia</a>
              <span class="lic mono">CC BY-SA 3.0</span>
            </li>
          </ul>
        </section>

        <section>
          <h3 class="cap">{{ ui.t('about.ai.title') }}</h3>
          <p>{{ ui.t('about.ai.body') }}</p>
          <a class="doc" :href="DOCS.ai" target="_blank" rel="noopener">
            docs/ai-generated-fields.json ↗
          </a>
        </section>

        <section>
          <h3 class="cap">{{ ui.t('about.map.title') }}</h3>
          <p>{{ ui.t('about.map.body') }}</p>
        </section>

        <section>
          <h3 class="cap">{{ ui.t('about.errata.title') }}</h3>
          <p>{{ ui.t('about.errata.body') }}</p>
          <div class="docs">
            <a class="doc" :href="DOCS.issues" target="_blank" rel="noopener">GitHub Issues ↗</a>
            <a class="doc" :href="DOCS.openSource" target="_blank" rel="noopener">
              docs/开源说明.md ↗
            </a>
          </div>
        </section>

        <section>
          <h3 class="cap">{{ ui.t('about.thanks.title') }}</h3>
          <p>{{ ui.t('about.thanks.body') }}</p>
        </section>
      </div>

      <footer>
        <p class="credit">
          <span class="cap">{{ ui.t('about.credit') }}</span>
          Chronograph — Human History According to AI, Magnús Smári Smárason, 2026 ·
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">
            CC BY 4.0
          </a>
        </p>
        <a class="repo mono" :href="REPO" target="_blank" rel="noopener">
          {{ ui.t('about.repo') }} ↗
        </a>
      </footer>
    </aside>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  justify-content: flex-end;
  background: var(--veil);
}

.sheet {
  width: min(520px, 100%);
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--card);
  border-left: 1px solid var(--rule-2);
  box-shadow: var(--shadow-2);
  animation: slide 220ms var(--ease);
}
@keyframes slide {
  from {
    opacity: 0;
    transform: translateX(18px);
  }
}

header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 20px 13px;
  border-bottom: 1px solid var(--rule-2);
  flex: none;
}
header .left {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
header h2 {
  font-family: var(--font-display);
  font-size: var(--fs-h2);
  line-height: 1.25;
}
.close {
  margin-left: auto;
  padding: 3px;
  font-size: 14.5px;
  line-height: 1;
  color: var(--ink-3);
}
.close:hover {
  color: var(--rust);
}

.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

section {
  padding: 14px 20px;
  border-bottom: 1px solid var(--rule);
}
section h3 {
  margin-bottom: 8px;
}
section p {
  font-size: var(--fs-sm);
  line-height: 1.9;
  color: var(--ink-2);
}

.links {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.links li {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 13px;
}
.links a {
  color: var(--ink);
  border-bottom: 1px solid var(--rule-2);
}
.links a:hover {
  border-bottom-color: var(--rust);
  color: var(--rust);
}
.lic {
  margin-left: auto;
  font-size: var(--fs-label);
  letter-spacing: 0.08em;
  color: var(--ink-4);
}

.doc {
  display: inline-block;
  margin-top: 9px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--rust);
}
.doc:hover {
  text-decoration: underline;
}
.docs {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}

footer {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 12px 20px 14px;
  border-top: 1px solid var(--rule-2);
  background: var(--paper);
}
.credit {
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-3);
}
.credit .cap {
  display: block;
  margin-bottom: 2px;
}
.credit a {
  color: var(--rust);
}
.credit a:hover {
  text-decoration: underline;
}
.repo {
  font-size: 12px;
  letter-spacing: 0.06em;
  color: var(--ink-2);
}
.repo:hover {
  color: var(--rust);
}
</style>
