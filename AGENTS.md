# AGENTS.md

> 给 AI 助手与自动化代理的入口文档。这里只写硬约束与权威文档索引，不复述细节；遇到冲突时，流程以 [`docs/协作开发/00-合作手册.md`](./docs/协作开发/00-合作手册.md) 为准，数据与对外口径以 [`docs/开源说明.md`](./docs/开源说明.md) 与 [`CONTRIBUTING.md`](./CONTRIBUTING.md) 为准。

## 1. 项目定位与边界

- 纯静态、只读的个人开源历史可视化项目：把事件、政区、人物、战争叠在同一时间轴上，用 3D 地球与 2D 地图呈现。无后端、无数据库、无账号、无 UGC。
- 个人作品，**无 SLA、无响应时限、不承诺数据更新频率**，不按生产服务维护；成熟度未达生产门槛，见 `docs/生产级成熟度评估.md`。
- **桌面优先**：UI 面向桌面设计，移动端未适配。不要主动承接移动端完整适配、响应式重写类任务。
- 不是史料数据库、不是学术工具、不是权威结论来源；数据含 AI 生成内容，不保证史实准确。

## 2. 目录结构与技术栈

技术栈：Vue 3 + TypeScript + Vite + Pinia + CesiumJS + MapLibre GL JS + Turf。

```
src/
├── components/    界面组件（卡片、面板、地图舞台、关于页）
├── composables/   组合式逻辑（useGlobeData）
├── services/      命令式服务：globe.ts / map2d.ts / data.ts / http.ts
├── stores/        Pinia 状态（ui / timeline / layers / people / wars）
├── lib/           纯函数（i18n、格式化、地理、provenance、regions）
├── config/        年份范围、底图、路径、阈值
├── types/         共享数据模型
└── styles/        tokens.css + base.css
public/            随包静态数据（事件、政区、人物、战争、国界），禁止手改
scripts/           数据生成、校验、审计、部署脚本
docs/              文档；docs/协作开发/ 为协作账本
dist/              构建产物，不入库
```

架构红线：

1. Cesium / MapLibre 的实例、实体绝不放进 Vue 的 `ref()` / `reactive()`，统一由 `src/services/` 命令式管理。
2. 用户可见文案必须走 `src/lib/i18n.ts`，中英文同时补齐；不在组件里硬编码中文。
3. 请求统一走 `src/services/http.ts`，不在组件里新写裸 `fetch`。
4. 禁止 emoji，包括代码、注释、文档、提交信息与界面文案。

## 3. 本地门禁命令

以 `package.json` 实际脚本为准：仓库有 `test`（vitest），暂无 `lint` 脚本。

| 命令 | 用途 | 何时必须 |
|---|---|---|
| `npm run typecheck` | `vue-tsc --noEmit` 类型检查 | 任何代码改动 |
| `npm test` | `vitest run`，跑 `src/**/*.test.ts` | 改 `src/` 逻辑或测试 |
| `npm run validate:data` | 全量校验 `public/` 数据资产 | 改 `public/` 或 `scripts/` |
| `npm run validate:trust` | 可信度 dry-run，输出覆盖率与缺失清单（默认不阻断，`--strict` 退出码 1） | 改内容来源或可信度台账 |
| `npm run verify:smoke` | 故障注入冒烟（先构建，需 Chromium 系浏览器；可用 `EDGE_PATH` / `CHROME_PATH` 指定） | 改请求层、错误提示、加载逻辑 |
| `npm run prebuild` | 静默数据校验（`validate-data.mjs --quiet`） | 单独跑或确认构建前置；`npm run build` 会自动触发，不得绕过或删除该钩子 |
| `npm run build` | 生产构建，通过后产物在 `dist/` | 任何代码或数据改动 |
| `npm run audit:profiles` | 人物 / 战争档案完整度审计 | 改人物或战争档案 |

通过标准：退出码 0；`validate:data` 与 `prebuild` 要求 ERROR 0 / WARNING 0。交付时必须附命令与结果。

## 4. 合规口径（硬约束）

1. **现代国界图层**：台湾并入中国要素（见 `scripts/data/fix_china_territory.cjs`）；中国相关争议地区按中华人民共和国官方立场处理。
2. **其他争议地区**：使用中性斜线纹理并标注「多方主张」，不涂单一主权色、不标注首都（UR-004）。
3. **在世政治人物**：只保留事实时间线，移除评价、语录等立场性内容；不新增在世人物评价。
4. **进行中的冲突**：删除结局与胜负分析，只保留事实性时间线，不下结论。
5. **署名与 AI 标识必须进界面**：CC BY 4.0 两项核心语料（Chronograph 指定署名字符串 + 上游链接 + 修改声明；Cliopatria）与「AI 生成 / 未核验」标识必须出现在用户可见界面（关于页、卡片徽标等），不能只写在 README / NOTICE。
6. 不得删除、弱化或伪造许可与署名；历史政区是学术近似示意，不代表当代主权立场。

## 5. 数据规则

- **不改 `public/` 原始数据**：批量数据只能通过 `scripts/` 生成、修复、简化并跑 `validate:data`。手工单文件修补也必须同步 `.gz` / `.lod` 派生副本并留痕。
- **AI 生成字段必须溯源**：由模型生成或补写的字段、整份重写档案、新增档案与修复记录，同步写入 `docs/ai-generated-fields.json`（`wars` / `people` / `polities` / `fixes` 等分区），让读者能区分 curated 与 unverified。
- 一条改动一件事：附可核验来源；不因印象改年份、坐标、人名；不把个人立场写进 `evaluation.objective` / `legacy.significance`。
- 批量脚本（`repair:data`、`simplify:polities`、`enrich:*` 等）没有 dry-run 或主控批准时不要直接运行。

## 6. 提交规则

- **禁止 `git add -A`、`git add .`、`git add -u`、`git add -f`**。按主题逐文件精确 `git add <path>`，一次提交只含一个主题。
- 提交前用 `git status` 核对：不得带入 `.env`、`dist/`、`node_modules/`、`data/`、`*.backup_*`、日志与本地快照。
- **返工文件，不提交**：`src/lib/compare.ts`、`src/components/AtlasBoard.vue`、`src/components/PersonCard.vue`。除当前任务明确要求处理这三个文件外，一律不 add。
- 不直接改或推 `main`，走分支 + PR；不 `push --force`，不 `reset --hard` 共享分支，不删远端分支。
- 不新增依赖、不改 `package.json` / `package-lock.json`、不执行部署（`npm run deploy:cf`），除非主控明确批准。
- 提交信息格式：`类型(范围): 一句话说明`，类型取 `feat` / `fix` / `docs` / `data` / `refactor` / `chore`；数据修正必须写来源。

## 7. 权威文档索引

| 文档 | 内容 |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) | 编码铁律：禁止 emoji；直面问题、不回避、说明可能出错原因 |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | 贡献范围、Issue / PR 规则、数据改动规范、许可 |
| [`docs/协作开发/00-合作手册.md`](./docs/协作开发/00-合作手册.md) | 协作机制、认领流程、Git 最小流程、冲突处理、自查清单 |
| [`docs/开源说明.md`](./docs/开源说明.md) | 项目定位与非目标、数据许可分层、可信度分级、争议处理、AI 生成声明 |

补充参考：`README.md`（定位与命令）、`docs/ai-generated-fields.json`（AI 生成字段清单）、`docs/协作开发/30-进度跟踪.md`（认领看板）、`scripts/README.md`（数据流水线）。
