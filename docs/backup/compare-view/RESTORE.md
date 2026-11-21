# 「对比」旧视图备份（2026-11-21 移除）

顶部导航原有的【对比】视图已删除，【图版】改名为【对比】。

备份内容：

- `CompareBoard.vue`：旧视图组件全文。

## 恢复时需要一并还原的接线

1. `src/types/index.ts`

   ```ts
   export type ViewMode = 'explore' | 'compare' | 'atlas';
   ```

2. `src/components/AppHead.vue`

   ```ts
   const views: { id: ViewMode; key: 'nav.explore' | 'nav.compare' | 'nav.atlas' }[] = [
     { id: 'explore', key: 'nav.explore' },
     { id: 'compare', key: 'nav.compare' },
     { id: 'atlas', key: 'nav.atlas' },
   ];
   ```

3. `src/App.vue`

   - `import CompareBoard from './components/CompareBoard.vue';`
   - `import type { CompareSubject } from '@/lib/compare';`
   - 两栏主体状态：

     ```ts
     const subjectA = ref<CompareSubject>({ kind: 'region', id: 'eastAsia' });
     const subjectB = ref<CompareSubject>({ kind: 'region', id: 'mediterranean' });
     ```

   - `pinnedSide` 计算属性与 `onPinPolity(side: 'A' | 'B')` 函数（内容见备份组件与
     `git log`/历史版本）。
   - 模板块：

     ```html
     <CompareBoard
       v-if="ui.view === 'compare'"
       v-model:subject-a="subjectA"
       v-model:subject-b="subjectB"
       :events="data.filteredEvents.value"
       :names="data.polityNames.value"
       @select="onPickEvent"
     />
     ```

   - `PolityCard` 上的 `:pinned="pinnedSide"` 与 `@pin="onPinPolity"`。

4. `src/components/PolityCard.vue`

   - `pinned?: 'A' | 'B' | null` prop、`pin: [side: 'A' | 'B']` emit。
   - `footer` 里的 `pin-row` 两个按钮（`compare.setA` / `compare.inA` 等）与 `.pin-hint` 文案。
   - 对应 CSS：`.pin-row`、`.pin-hint`。

5. `src/lib/i18n.ts`

   - 中文与英文各恢复 `'nav.compare'` 键（中文「对比」；英文 `Compare`），并把
     `'nav.atlas'` 改回（中文「图版」；英文 `Plates`）、`'atlas.edition'` 改回
     `图版 · 同尺度双图` / `Plate · Two maps, one scale`、`'atlas.loading'` 改回
     `正在读取图版数据…` / `Reading the plate…`。
   - `compare.*` 的其余文案仍在 `i18n.ts` 中（“同年” `compare.sameYear` 仍被图版使用），无需恢复。

6. `src/lib/compare.ts` 未删除（图版仍用 `dedupeRestatements`）。
