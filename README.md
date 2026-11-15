# 寰宇纪年 · Earth Historical Timeline

基于 CesiumJS 与 MapLibre GL 的全球历史时空可视化平台：在 3D 地球或 2D 地图上按年份浏览历史事件、历史政区、人物足迹与战争，并对同一时期的不同文明做横向对照。

> 在线演示：<https://earth.tazume-sans.cn/>
>
> 当前版本：2.0.0。2026-10-20 完成 Vue 3 + TypeScript + Pinia 重写，旧的「微内核 + 插件 + 手写 DOM」架构已退场。需求与进度以 [docs/REQUIREMENTS.md](./docs/REQUIREMENTS.md) 为唯一账本。

## 快速开始

```bash
npm install
npm run dev        # → http://localhost:3000
npm run build      # prebuild 会先跑数据校验
npm run preview    # 预览 dist 产物
npm run typecheck  # vue-tsc --noEmit
```

| 命令 | 用途 |
|------|------|
| `npm run validate:data` | 全量校验数据资产（中英事件对齐、政区分片、备份残留等），输出 ERROR/WARNING 计数 |
| `npm run report:data` | 清点数据资产：有哪些数据、覆盖率、缺口 |
| `npm run repair:data` | 修复取值无歧义的机械缺陷（默认试运行） |
| `npm run compare:locales` | 比对中英事件条目差异 |
| `npm run audit:polities` | 审计政区体积、顶点数与坐标精度 |
| `npm run simplify:polities` | 几何简化、坐标量化、生成 `.gz` 与 LOD 副本 |
| `npm run build:people-coords` | 从人物档案聚合生平足迹坐标 → `people/coords.json` |
| `npm run enrich:polity-facts` | 生成政区事实字段 → `ne/polity_facts.json` |

生产构建前会自动执行 `validate-data.mjs --quiet`；数据不通过则构建中止。

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
| 人物 | 档案卡片含生平、评价与语录；打开卡片时在球面绘制生平足迹折线与站点 |
| 战争 | 94 场档案：概况、战前兵力对比、指挥官与角色、阶段与战役、战区坐标标记 |
| 横向对照 | 报纸版对照界面（CompareBoard），A/B 两列可选政区，支持指定年代区间（最宽 300 年）汇总统计 |
| 按政区筛选 | 事件 / 人物 / 战争三处面板均可「仅当前政区」，按坐标或战区圆心与政区存续期求交 |

### 图层管理

事件标记、事件标签、历史政区、政区名称、载入相邻世纪、现代国界、战争地点七个开关；底图为 Esri ArcGIS World Topo（标准）与 World Imagery（卫星），集中配置在 `src/config/index.ts` 的 `BASEMAPS`。

### 已知交互限制

- 时间轴**没有自动播放/暂停**，也不支持空格键播放；方向键左右步进，其余靠轨道按钮。
- UI 面向桌面设计，移动端未适配。

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
│   ├── services/              # globe.ts / map2d.ts / data.ts / war-data.ts
│   ├── stores/                # Pinia 5 个 store
│   ├── lib/                   # i18n / format / compare / geo / names / regions /
│   │                          #   eventLinks / polityScope / wiki
│   ├── types/index.ts         # 共享数据模型
│   ├── config/index.ts        # 年份范围、底图、路径、阈值常量
│   └── styles/                # tokens.css + base.css
├── public/
│   ├── events/  en-events/    # 逐年事件（中 / 英）
│   ├── ne/polities/           # 政区世纪分片 + .lod.json + .json.gz
│   ├── ne/                    # 国界、名称映射、描述、资产、事实、旗帜
│   ├── people/profiles/       # 人物档案 + coords.json
│   └── wars/profiles/         # 战争档案 + index.json + war_locations.json
├── scripts/                   # 数据流水线（见 scripts/README.md）
├── docs/                      # 需求账本、项目设计文档、原型 HTML
└── design/                    # 视觉风格原型（单 HTML）
```

## 数据资产

`npm run validate:data` 当前结果：**ERROR 0 / WARNING 0**。

| 数据集 | 规模 | 说明 |
|--------|------|------|
| 事件（中 / 英） | 各 17,998 条，5,227 个年份文件 | 差异 0，纳入构建前校验 |
| 历史政区 | 55 个世纪文件、18,069 要素、472 万顶点 | 55 个 LOD 分片 + 110 个预压缩副本；最大单文件 18.4 MB |
| 政区参考数据 | `polity_descriptions` 1,971 键、`polity_facts` 1,970 条、`polity_names_zh` 1,640 键、`polity_assets` 201 键 | 含中文简介、事实字段、国旗标记 |
| 人物 | 415 个文件 | 档案 + 足迹坐标聚合表 |
| 战争 | 94 场档案 | 坐标由战役坐标中位数推导，重复的硝石战争档案已删除 |
| 现代国界 | Natural Earth 110m 面（177 要素）+ 50m 线（390 要素） | |

**几何双档**：相机高度超过 `POLITY_LOD_HEIGHT`（9,000,000 m）时用 `.lod.json`（0.25° / 2 位小数），近景用全精度（0.01° / 4 位小数）。两档都常驻缓存，缺 LOD 时静默回退全精度，校验脚本会报告缺失分片。

`public/` 总量约 272 MB（含 `.gz` 副本）。原始 182 MB Cliopatria 导出只在 `data/` 本地保留，构建插件 `strip-non-shippable` 会阻止它和所有 `*.backup_*` / `*_backup.*` 文件进入 `dist`。

## 数据流水线与可复现性

全部脚本的用途、输入、输出、前置条件与可复现状态见 [scripts/README.md](./scripts/README.md)。要点：

- 构建期脚本不依赖外部 API；翻译与内容生成脚本需要 `.env` 中的模型凭据，且本机可用的智谱型号为 `glm-4-flash-250414`。
- `translate_names.cjs` 的输入 `scripts/_missing_names.json` 缺失，目前**不可复现**；其产物 `polity_names_zh.json` 数据完整并通过校验。
- `build_final_descriptions.cjs` 依赖不存在的 `/tmp/reusable_descs.json`，会静默降级。
- 生成类脚本的凭据一律从 `.env` 读取，源码中不含密钥。`.env` 已 gitignore。

## 部署

线上为阿里云轻量服务器（Ubuntu 22.04 + Nginx），静态托管 `dist/`。服务器地址、SSH 与更新步骤记录在本地 `SERVER.md`（含凭据信息，不入库）。标准流程：

```bash
git pull && npm run build
```

**注意**：部署前请确认 `dist/` 已由最新源码重建，且本地改动已提交——服务器只能拉到已提交的内容。

## 文档索引

| 文件 | 内容 | 状态说明 |
|------|------|----------|
| [docs/REQUIREMENTS.md](./docs/REQUIREMENTS.md) | 需求账本 R00a–R37、状态与决策记录 | 进行中的权威进度表 |
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

工程层面尚未落地：全局搜索（`Ctrl+K`）、事件热力图、UGC 提交、自动播放、移动端适配、单元测试与 CI、后端/PostGIS（仅在设计文档里规划）。`package.json` 目前没有 `test` 或 `lint` 脚本。

## 数据来源

| 数据集 | 来源 | 协议 |
|--------|------|------|
| 历史事件（英文源） | [Human History According to AI](https://github.com/Magnussmari/Human_history_Acording_to_AI) by Magnús Smári Smárason | CC BY 4.0 |
| 历史事件（中文） | 本项目经 DeepSeek API 翻译 | CC BY 4.0（继承） |
| 历史政区 | [Cliopatria](https://github.com/Seshat-Global-History-Databank/cliopatria)（Seshat Global History Databank） | CC BY 4.0 |
| 政区简介 / 事实 / 人物 / 战争 | 本项目经 Wikipedia REST API 与大模型生成 | 摘要部分 CC BY-SA 3.0；生成内容长尾条目偶有史实偏差，需逐条复核 |
| 现代国界 | [Natural Earth](https://www.naturalearthdata.com/) | Public Domain |
| 现代国家资产 | [mledoze/countries](https://github.com/mledoze/countries) + FlagCDN | MIT / Public Domain |
| 底图瓦片 | Esri ArcGIS World Topo / World Imagery | 见 Esri 使用条款 |

> **署名要求**：历史事件数据（CC BY 4.0）使用时须注明原作者 Magnús Smári Smárason 及项目链接；发布界面中亦应体现。
