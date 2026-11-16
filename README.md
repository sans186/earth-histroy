# 寰宇纪年 · Earth Historical Timeline

> *A personal-learning static visualisation of world history across time and space — built with CesiumJS, MapLibre GL and Vue 3.*

在 3D 地球或 2D 地图上按年份浏览历史事件、历史政区、人物足迹与战争，并对同一时期的不同文明做横向对照。

| | |
|------|------|
| 在线演示 | <https://earth.tazume-sans.cn/> |
| 仓库 | <https://github.com/sans186/earth-histroy> |
| 代码许可 | [MIT](./LICENSE) |
| 数据许可 | 分层，见 [NOTICE](./NOTICE) 与 [开源说明 §3](./docs/开源说明.md) |
| 当前版本 | 2.0.0 —— 2026-10 完成 Vue 3 + TypeScript + Pinia 重写，旧的「微内核 + 插件 + 手写 DOM」架构已退场 |

---

## 定位与免责

**这是一个个人学习用的静态历史时空可视化实验，不是史料数据库、不是学术工具，也不是对外提供服务。**

- 数据来自公开数据集、Wikipedia 摘要与大模型生成，**不保证史实准确性**。请勿用于论文引用、事实核查、教学定论或商业决策。
- 长尾条目（人物、战争、政区简介、事实字段）含 AI 生成内容，**未逐条人工核验**；机器可读清单见 [docs/ai-generated-fields.json](./docs/ai-generated-fields.json)，审计结论见 [docs/数据完整性审计.md](./docs/数据完整性审计.md)。
- 历史边界是学术数据集的近似记录，**不代表对当代主权归属的立场**；台湾、香港、澳门是中国的一部分。
- **发现数据错误或有争议的表述怎么办**：按 [CONTRIBUTING.md](./CONTRIBUTING.md) 提 `[数据勘误]` Issue，写明文件与字段、现状与应改为、以及可核验来源。没有来源的争议不会被直接裁定——我们没有能力裁定史实争议。分级标准与处理口径见 [docs/开源说明.md](./docs/开源说明.md) §5（数据可信度分级）与 §6（争议的分类处理，含 §6.2 边界与主权表述）。
- **二次分发请保留署名**：历史事件数据（CC BY 4.0）须按上游要求注明作品名、原作者 Magnús Smári Smárason 与年份，并附上游仓库链接（确切措辞见 [NOTICE](./NOTICE)）；Wikipedia 摘要部分为 CC BY-SA 3.0。

> 本 README 描述的是**当前代码现状**。`docs/项目设计文档.md` 与 [改造方案.md](./改造方案.md) 含规划中或历史诊断的内容，请勿当作现状阅读。需求与进度以 [docs/REQUIREMENTS.md](./docs/REQUIREMENTS.md) 为唯一账本。

## 目录

- [定位与免责](#定位与免责)
- [快速开始](#快速开始)
- [功能总览](#功能总览)
- [数据加载与故障处理](#数据加载与故障处理)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [数据资产](#数据资产)
- [数据流水线与可复现性](#数据流水线与可复现性)
- [部署](#部署)
- [已知限制](#已知限制)
- [贡献与勘误](#贡献与勘误)
- [文档索引](#文档索引)
- [待办](#待办)
- [许可与数据来源](#许可与数据来源)

## 快速开始

需要 Node.js 与 npm（本项目基于 Vite 6，建议使用 Node.js 20 或更高的 LTS 版本；开发环境为 v22.22.2 / npm 10.9.7）。**没有后端、不需要数据库或任何服务端密钥。**

```bash
git clone https://github.com/sans186/earth-histroy.git
cd earth-histroy
npm ci
npm run dev        # → http://localhost:3000
npm run build      # prebuild 会先跑数据校验，不通过则中止
npm run preview    # 预览 dist 产物
npm run typecheck  # vue-tsc --noEmit
```

开发端口配置为 3000，被占用时 Vite 会自动改端口；也可显式指定：`npm run dev -- --port 3005 --strictPort`。

| 命令 | 用途 |
|------|------|
| `npm run typecheck` | `vue-tsc --noEmit` 类型检查 |
| `npm run verify:smoke` | 故障注入冒烟：构建后启动本地静态服务，注入两个 503，用无头 Chromium 验证错误横幅、重试次数与降级；再验证正常加载不误报（需 Chromium 系浏览器，可用 `EDGE_PATH` / `CHROME_PATH` 指定） |
| `npm run validate:data` | 全量校验数据资产（中英事件对齐、政区分片、备份残留等），输出 ERROR/WARNING 计数 |
| `npm run audit:profiles` | 只读审计战争 / 人物档案的字段完整度、索引一致性与通识覆盖 |
| `npm run report:data` | 清点数据资产：有哪些数据、覆盖率、缺口 |
| `npm run repair:data` | 修复取值无歧义的机械缺陷（默认试运行） |
| `npm run compare:locales` | 比对中英事件条目差异 |
| `npm run audit:polities` | 审计政区体积、顶点数与坐标精度 |
| `npm run simplify:polities` | 几何简化、坐标量化、生成 `.gz` 与 LOD 副本 |
| `npm run build:people-coords` | 从人物档案聚合生平足迹坐标 → `people/coords.json` |
| `npm run enrich:polity-facts` | 生成政区事实字段 → `ne/polity_facts.json` |

生产构建前会自动执行 `validate-data.mjs --quiet`；数据不通过则构建中止。

> 首次冷启动较慢：Vite 需要预构建依赖并把 Cesium 的静态资源拷到 `public/`，预热后是毫秒级。`public/` 有一万多个数据文件，dev server 的 watcher 已刻意限定在 `src/`，否则 Windows 上会因监听过多文件而卡死。

## 功能总览

### 浏览与导航

- **3D 地球 / 2D 地图双视图** —— CesiumJS 与 MapLibre 各自独立渲染，事件、政区、底图、点选、卡片行为一致，切换时状态同步
- **时间轴** —— 非线性分段滑块（公元前压缩、近现代拉伸），年份范围 -3100 ~ 2026；轨道两侧 `-5 / -1 / +1 / +5` 四个步进按钮；输入框可直接跳年
- **右栏事件索引** —— 只显示当前年份前后 5 年（±5），拖动期间不发请求，松手后一次性加载并缓存
- **语言切换** —— 中 / 英双语，含政区名称映射（1,640 键）与事件数据

### 数据层展示

| 模块 | 内容 |
|------|------|
| 历史事件 | 中英各 17,998 条，5,227 个逐年 JSON（-3200 ~ 2026）；卡片含分类、描述、来源、同期徽标、按 id 定位的关联条目与 `graph_edges` 关系 |
| 历史政区 | Cliopatria 18,069 个要素，按世纪分片；随年份过滤并涂色，卫星底图下改为红色边界线；点击弹出卡片 |
| 政区卡片 | 国旗、首都、人口、面积、中文简介、政体形式、语言/族群/宗教/文字/货币、前身与后继、今属、范围内战争与人物数；1850 年前的政区不套用现代国家资产 |
| 政区名称 | 2D 用 DOM 标签层（按面积分级 + 矩形碰撞避让），3D 用 LabelCollection（按面积排名给可见距离） |
| 人物 | 418 份档案，卡片含生平、评价与语录；打开卡片时在球面绘制生平足迹折线与站点 |
| 战争 | 96 场档案：概况、战前兵力对比、指挥官与角色、阶段与战役、战区坐标标记 |
| 横向对照 | 报纸版对照界面（CompareBoard），A/B 两列可选政区，支持指定年代区间（最宽 300 年）汇总统计 |
| 按政区筛选 | 事件 / 人物 / 战争三处面板均可「仅当前政区」，按坐标或战区圆心与政区存续期求交 |

### 图层管理

事件标记、事件标签、历史政区、政区名称、载入相邻世纪、现代国界、战争地点七个开关；底图为 Esri ArcGIS World Topo（标准）与 World Imagery（卫星），集中配置在 `src/config/index.ts` 的 `BASEMAPS`。

## 数据加载与故障处理

所有随包 JSON 都经 `src/services/http.ts` 一个入口读取，配置集中在 `src/config/index.ts` 的 `NETWORK`：12 s 超时（世纪文件 30 s）、2 次重试 + 指数退避与抖动、最多 8 个并发请求、支持 `Retry-After`。只对可恢复的失败重试（网络错误、超时、408/429/5xx），年份文件与人物档案的 404 视为「本来就没有这条数据」，不会误报。

失败不会污染缓存：降级用的空值只返回给调用方，不写入缓存，因此「重试」一定会重新发请求。请求层维护一份按 URL 去重的活跃失败表与最多 50 条的历史环形缓冲；任一请求成功后自动移除对应失败项，横幅随之消失。

用户可见的是一个统一的 `ErrorNotice`：

- **数据失败**：顶部非阻塞横幅，写明失败项数、具体资源与失败原因、下一步怎么做；提供「重试」（重新加载事件/政区/参考数据并通知 2D 视图重绘）、「忽略」、「复制诊断信息」。页面已加载的内容保持可用。
- **渲染器启动失败**：阻塞式卡片，说明通常是 WebGL/显卡问题，动作是「刷新页面」。
- **诊断信息**是脱敏 JSON：时间、路径、UA、在线状态、活跃/近期失败记录与网络参数，不含凭据或用户输入。

降级约定：政区 LOD 文件失败自动回退全量档；政区整体失败只影响政区层，事件与时间轴照常；单个年份文件失败只丢该年，窗口内其余年份仍显示；全部年份都失败时保留上一次成功的时间窗口，不清空页面；人物/战争/政区参考数据失败降级为空，不影响主界面。

## 技术栈

| 层面 | 选型 |
|------|------|
| UI 框架 | Vue 3（Composition API + `<script setup>`） |
| 类型 | TypeScript + `vue-tsc` |
| 状态 | Pinia（`stores/ui` `timeline` `layers` `people` `wars`） |
| 3D | CesiumJS 1.123（**命令式 Service，绝不进入 Vue 响应式体系**） |
| 2D | MapLibre GL 5.24 |
| 几何 | @turf/turf 7 |
| 构建 | Vite 6 + `@vitejs/plugin-vue` + `vite-plugin-static-copy` + `vite-plugin-compression` |
| 样式 | 原生 CSS + CSS Custom Properties（`styles/tokens.css`） |

**分层红线**：Cesium / MapLibre 实例与 Entity 由 `src/services/` 中的单例命令式管理，Vue 只负责界面与状态。把这些对象交给 `reactive()` / `ref()` 代理会导致性能雪崩或运行时异常。

## 项目结构

```
Earth/
├── index.html                 # 入口 + 启动保护样式
├── vite.config.js             # Cesium 静态拷贝、gzip 预压缩、非发布文件拦截
├── src/
│   ├── App.vue                # 布局与全局编排
│   ├── main.ts
│   ├── components/            # 17 个界面组件（AppHead / GlobeStage / MapStage /
│   │                          #   CompareBoard / EventCard / PolityCard / WarCard /
│   │                          #   PersonCard / TimeScale / LayerPanel / SidePanel ...）
│   ├── composables/           # useGlobeData：年份/相机/图层联动
│   ├── services/              # globe.ts / map2d.ts / data.ts / war-data.ts / http.ts
│   ├── stores/                # Pinia 5 个 store
│   ├── lib/                   # i18n / format / compare / geo / names / regions /
│   │                          #   eventLinks / polityScope / wiki / appError
│   ├── types/index.ts         # 共享数据模型
│   ├── config/index.ts        # 年份范围、底图、路径、阈值、网络参数
│   └── styles/                # tokens.css + base.css
├── public/
│   ├── events/  en-events/    # 逐年事件（中 / 英）
│   ├── ne/polities/           # 政区世纪分片 + .lod.json + .json.gz
│   ├── ne/                    # 国界、名称映射、描述、资产、事实、旗帜
│   ├── people/profiles/       # 人物档案 + coords.json
│   └── wars/profiles/         # 战争档案 + index.json + war_locations.json
├── scripts/                   # 数据流水线（见 scripts/README.md）
├── docs/                      # 需求账本、开源说明、评估与审计、原型 HTML
└── design/                    # 视觉风格原型（单 HTML）
```

## 数据资产

`npm run validate:data` 当前结果：**ERROR 0 / WARNING 0**；`npm run audit:profiles`：**战争 96/96、人物 418/418、孤儿档案 0**。

| 数据集 | 规模 | 说明 |
|--------|------|------|
| 事件（中 / 英） | 各 17,998 条，5,227 个年份文件 | 差异 0，纳入构建前校验 |
| 历史政区 | 55 个世纪文件、18,069 要素、472 万顶点 | 55 个 LOD 分片 + 110 个预压缩副本；最大单文件 18.4 MB |
| 政区参考数据 | `polity_descriptions` 1,971 键、`polity_facts` 1,970 条、`polity_names_zh` 1,640 键、`polity_assets` 201 键 | 含中文简介、事实字段、国旗标记 |
| 人物 | 418 份档案 + 足迹坐标聚合表 | 2,186 个生平站点，中英描述 100% 齐全 |
| 战争 | 96 场档案 | 坐标由战役坐标中位数推导，重复的硝石战争档案已删除 |
| 现代国界 | Natural Earth 110m 面（177 要素）+ 50m 线（390 要素） | Public Domain |

**几何双档**：相机高度超过 `POLITY_LOD_HEIGHT`（9,000,000 m）时用 `.lod.json`（0.25° / 2 位小数），近景用全精度（0.01° / 4 位小数）。两档都常驻缓存，缺 LOD 时静默回退全精度，校验脚本会报告缺失分片。

`public/` 总量约 272 MB（含 `.gz` 副本）。原始 182 MB Cliopatria 导出只在本地 `data/` 保留，不入库；构建插件 `strip-non-shippable` 会阻止它和所有 `*.backup_*` / `*_backup.*` 文件进入 `dist`。

## 数据流水线与可复现性

全部脚本的用途、输入、输出、前置条件与可复现状态见 [scripts/README.md](./scripts/README.md)。要点：

- 构建期脚本不依赖外部 API；翻译与内容生成脚本需要 `.env` 中的模型凭据（`.env` 已 gitignore），源码中不含密钥。
- `translate_names.cjs` 的输入 `scripts/_missing_names.json` 缺失，目前**不可复现**；其产物 `polity_names_zh.json` 数据完整并通过校验。
- `build_final_descriptions.cjs` 依赖不存在的 `/tmp/reusable_descs.json`，会静默降级。
- 档案补全类脚本（`enrich:profiles` / `generate:profiles`）是**一次性工具**，产物已提交；其中由模型生成的字段登记在 [docs/ai-generated-fields.json](./docs/ai-generated-fields.json)，标记为未核验。

## 部署

产物是**纯静态站点**：`npm run build` 生成 `dist/`，把整个目录交给任意静态托管即可（Nginx / GitHub Pages / Cloudflare Pages / 对象存储）。仓库里的 [nginx-earth.conf](./nginx-earth.conf) 是一份参考配置（gzip、SPA 回退、静态资源缓存）。

```bash
npm ci
npm run build
# 把 dist/ 发布到静态托管
```

注意事项：

- **不要直接发布仓库根目录**：`public/` 里的 `.gz` 预压缩副本需要服务端正确配置 `Content-Encoding`，且 `dist/` 才是经过构建与裁剪的产物。
- **子路径托管**：若部署在 `/xxx/` 而非域名根路径，需要设置 Vite 的 `base`，否则资源路径会 404。
- **更新前确认**：`dist/` 必须由最新源码重建；若服务器用 `git pull` 更新，只能拉到**已提交**的内容。
- 本项目不需要后端、数据库或服务端密钥；第三方底图瓦片与字体由浏览器直接请求，需保证客户端网络可访问。

## 已知限制

交互层面：

- 时间轴**没有自动播放/暂停**，也不支持空格键播放；方向键左右步进，其余靠轨道按钮。
- UI 面向桌面设计，移动端未适配。
- 第三方内部加载（Cesium `GeoJsonDataSource.load(url)`、MapLibre 瓦片与字体）不走统一请求层，其失败由渲染器自身处理，不会出现在数据失败横幅里。

工程层面：全局搜索（`Ctrl+K`）、事件热力图、UGC 提交、自动播放、移动端适配、单元测试与 CI、后端/PostGIS 均**尚未落地**（后几项只存在于设计文档中）。`package.json` 目前没有 `test` 或 `lint` 脚本；`verify:smoke` 是端到端故障注入冒烟，不替代单元测试与契约测试。成熟度自评见 [docs/生产级成熟度评估.md](./docs/生产级成熟度评估.md)——**本项目未达生产服务门槛，也不打算按生产服务维护**。

## 贡献与勘误

最欢迎的是**带来源的数据勘误**，其次是 bug 复现与小改动。开始之前请先读 [CONTRIBUTING.md](./CONTRIBUTING.md) 与 [docs/开源说明.md](./docs/开源说明.md) §5 / §6。

- Issue 标题：`[数据勘误] <条目名> — <一句话问题>`；正文写明文件与字段、现状、应改为、可核验来源。
- 无来源的勘误会先标记 `needs-source`，不会直接改数据；边界、命名、主权相关表述按 §6.2 优先处理。
- **不接受**大批量、无来源的 AI 重写。PR 改动前请跑 `npm run validate:data`、`npm run typecheck`、`npm run audit:profiles`。

## 文档索引

| 文件 | 内容 | 状态说明 |
|------|------|----------|
| [docs/REQUIREMENTS.md](./docs/REQUIREMENTS.md) | 需求账本 R00a–R37、状态与决策记录 | 进行中的权威进度表 |
| [docs/开源说明.md](./docs/开源说明.md) | 开源定位、非目标、数据许可分层、争议与勘误处理、AI 生成内容声明、公开前检查清单 | 公开到 GitHub 前必读 |
| [docs/数据完整性审计.md](./docs/数据完整性审计.md) | 战争 / 人物档案完整性审计、本轮补充内容与可复跑命令 | 2026-11-15 |
| [docs/ai-generated-fields.json](./docs/ai-generated-fields.json) | 机器可读的 AI 生成字段 / 新增档案 / 勘误记录清单 | 每次生成后同步更新 |
| [docs/生产级成熟度评估.md](./docs/生产级成熟度评估.md) | 12 维度成熟度评分、12 条最小生产门槛核对与改进路线 | 2026-11-15 基线 10/33；同日 P0 修复后复核见文首 §0.1，仍未达生产门槛 |
| [docs/项目设计文档.md](./docs/项目设计文档.md) | 视觉/交互设计系统与**规划中**的技术选型 | 设计提案，其中后端 Java 栈、Vitest、Playwright 等尚未落地，勿当现状读 |
| [改造方案.md](./改造方案.md) | 2026-10 月对旧架构的诊断与分阶段路线图 | 历史诊断文档，Phase 0–2 已基本完成，文首有状态对照 |
| [scripts/README.md](./scripts/README.md) | 数据流水线可复现性清单 | 现行 |
| `docs/prototypes/`、`design/` | 对照界面与视觉风格的单 HTML 原型 | 参考稿 |

## 待办

按 `docs/REQUIREMENTS.md`，仍悬空的需求：

- **R08** 弹出卡片之外的事件呈现形式（四种方案已列，未选型）
- **R29** 后续扩展性评估（新增人物/战争数据与新功能的架构层面改造）
- **R37** 项目备选名待选
- **R05** 智谱补全人物档案（进行中；事件坐标、战争书目、人物照片经评估放弃，原因见账本决策记录）

公开仓库层面的待办：界面内的 CC BY 署名展示、CHANGELOG 与首个 git tag、CI 门禁、CC BY-SA 单独标注、模型生成 `sources` 字段的人工核对。详见 [开源说明 §10 检查清单](./docs/开源说明.md)。

## 许可与数据来源

**代码与文档**：[MIT](./LICENSE)，Copyright (c) 2026 sans186。
**`public/` 下的数据**：各有上游许可，**不受 MIT 覆盖**，完整汇总见 [NOTICE](./NOTICE)。

| 数据集 | 来源 | 协议 |
|--------|------|------|
| 历史事件（英文源） | [Chronograph — Human History According to AI](https://github.com/Magnussmari/chronograph) by Magnús Smári Smárason, 2026 | CC BY 4.0（仅语料；上游代码为 MIT） |
| 历史事件（中文） | 本项目经 DeepSeek API 翻译 | CC BY 4.0（继承） |
| 历史政区 | [Cliopatria](https://github.com/Seshat-Global-History-Databank/cliopatria)（Seshat Global History Databank） | CC BY 4.0 |
| 政区简介 / 事实 / 人物 / 战争 | 本项目经 Wikipedia REST API 与大模型生成 | 摘要部分 CC BY-SA 3.0；生成内容长尾条目偶有史实偏差，需逐条复核 |
| 现代国界 | [Natural Earth](https://www.naturalearthdata.com/) | Public Domain |
| 现代国家资产 | [mledoze/countries](https://github.com/mledoze/countries) + FlagCDN | MIT / Public Domain |
| 底图瓦片 | Esri ArcGIS World Topo / World Imagery | 见 Esri 使用条款 |

> **署名要求**：按上游 NOTICE 指定，历史事件数据（CC BY 4.0）须注明 `Chronograph — Human History According to AI, Magnús Smári Smárason, 2026`、附 [上游仓库链接](https://github.com/Magnussmari/chronograph) 与 [CC BY 4.0 许可链接](https://creativecommons.org/licenses/by/4.0/)，并说明本项目做了翻译与格式改造；发布界面中亦应体现（**目前尚未落地**，见 [开源说明 §10](./docs/开源说明.md)）。上游仓库原名 `Human_history_Acording_to_AI`，现已改名为 `chronograph`，旧地址会 301 跳转。
>
> 政区简介 / 事实 / 人物 / 战争中的大模型生成内容**未逐条核验**，清单见 [docs/ai-generated-fields.json](./docs/ai-generated-fields.json)，不得作为史实引用依据。历史边界是学术数据集的近似记录，**不代表对当代主权归属的立场**；台湾、香港、澳门是中国的一部分。
