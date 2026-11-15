# scripts/ — 数据流水线

`public/` 下的全部数据都由这里的脚本产生。本文档说明每个脚本的**用途、输入、输出、前置条件**，以及**当前是否可复现**。

判断标准只有一条：**换一台干净的机器、只拿到这个仓库，能不能跑出同样的结果。** 做不到的脚本，无论代码多完整，都视同不存在。

---

## 目录

| 目录 | 职责 |
|------|------|
| `data/` | 数据集治理：切片、修复、简化、校验 |
| `fetch/` | 从外部来源抓取参考数据 |
| `translate/` | 翻译英文源数据 |
| `generate/` | 调用大模型生成内容 |
| `verify/` | 构建产物的端到端验证（故障注入冒烟） |

---

## verify/ — 构建产物验证

| 脚本 | 用途 | 输入 | 输出 | 前置条件 | 状态 |
|------|------|------|------|----------|------|
| `smoke-data-failure.mjs` | 本地静态服务两轮对照：注入两个 503 验证错误横幅、重试次数与降级，再验证正常加载不误报 | 已构建的 `dist/`、Chromium 系浏览器（`EDGE_PATH` / `CHROME_PATH` 可指定） | 控制台 5 条 PASS/FAIL，失败时退出码 1 | 先跑 `npm run build` | 可复现（本机实测 5/5） |

入口：`npm run verify:smoke`。不依赖任何测试框架或额外 npm 包，浏览器仅用 `--dump-dom` 读取渲染结果。

---

## data/ — 数据集治理

| 脚本 | 用途 | 输入 | 输出 | 前置条件 | 状态 |
|------|------|------|------|----------|------|
| `split-cliopatria.cjs` | 把 182 MB 原始导出按世纪切片并粗抽稀 | `data/cliopatria_polities_only.json` | `public/ne/polities/polities_*.json` | 原始文件存在 | 可复现 |
| `fix_china_territory.cjs` | 台湾并入 PRC 条目 | 世纪文件 | **就地修改**（先备份） | — | 可复现 |
| `fix_zangnan.cjs` | 用 turf 把藏南从印度多边形裁入 PRC | 世纪文件 | **就地修改**（先备份） | `@turf/turf` | 可复现 |
| `gen_name_zh.cjs` | 由 NE 数据 + 手工词典生成政区中英名映射 | Natural Earth 数据 | `public/ne/polity_names_zh.json` | — | 可复现 |
| `analyze-polities.mjs` | 审计政区体积、顶点数、坐标精度、字段 | 世纪文件 | 标准输出 | — | 可复现 |
| `simplify-polities.mjs` | 几何简化（绝对容差）+ 坐标量化 + 产出 `.gz`；`--tier=lod` 另出低精度副本 | 世纪文件 | `full` 就地写入并备份至 `data/polities-original/`；`lod` 只新增 `.lod.json`，不覆盖既有文件 | — | 可复现 |
| `validate-data.mjs` | 全量校验所有数据资产 | `public/` 全部 | 标准输出 + 退出码 | — | 可复现 |
| `repair-data.mjs` | 修复取值无歧义的机械缺陷（默认试运行） | `public/` 部分 | 就地写入 + 备份 | — | 可复现 |

**推荐顺序**（首次重建或调整精度时）：

```bash
node scripts/data/split-cliopatria.cjs                        # 仅在需要重切数据时
node scripts/data/analyze-polities.mjs                        # 先看清规模与精度
node scripts/data/simplify-polities.mjs                       # 全精度：试运行，确认压缩比
node scripts/data/simplify-polities.mjs --commit
node scripts/data/simplify-polities.mjs --tier=lod --commit   # 低精度副本
node scripts/data/validate-data.mjs
```

**关于两个层级**

政区几何按相机高度分两级下发，客户端按 `POLITY_LOD_HEIGHT`（`src/config`）择优：

| 层级 | 文件 | 容差 / 精度 | 体积 | 用途 |
|------|------|-------------|------|------|
| `full` | `polities_X_Y.json` | 0.01° / 4 位小数 | 85.9 MB | 近景，保真优先 |
| `lod` | `polities_X_Y.lod.json` | 0.25° / 2 位小数 | 21.5 MB | 远景，够用即可 |

两级都必须跑：只跑 `full` 不跑 `lod` 不会报错，客户端会静默回退到全精度——首屏因此慢数倍，而且没有任何提示。`validate-data.mjs` 会报告缺失的 LOD 分片。

> `fix_china_territory.cjs` 与 `fix_zangnan.cjs` 会**就地改写**世纪文件。简化脚本必须在它们之后运行，否则领土修正会被覆盖回原状。

---

## fetch/ — 外部数据抓取

| 脚本 | 用途 | 输入 | 输出 | 前置条件 | 状态 |
|------|------|------|------|----------|------|
| `fetch_polity_descriptions.cjs` | 从 Wikipedia REST API 抓政区摘要（中英） | 政区名列表 | `public/ne/polity_descriptions.json` | 网络 | 可复现（需网络） |
| `fetch_country_assets.cjs` | 从 jsdelivr world-countries 抓现代国家资产 | — | `public/ne/polity_assets.json` | 网络 | 可复现（需网络） |

---

## translate/ — 翻译

| 脚本 | 用途 | 输入 | 输出 | 前置条件 | 状态 |
|------|------|------|------|----------|------|
| `translate_names.cjs` | 批量翻译政区名称 | `scripts/_missing_names.json` | `public/ne/polity_names_zh.json` | `DEEPSEEK_API_KEY` | **不可复现**（输入文件缺失） |
| `translate_events.py` | 把 `en-events/` 逐年翻译为 `events/` | `public/en-events/*.json` | `public/events/*.json` | `DEEPSEEK_API_KEY`、网络 | 可复现（需额度） |

### 凭据来源已统一，输入仍有一个缺口

两个脚本都不再读取宿主的 `ANTHROPIC_API_KEY`（那是 IDE 的凭据，不属于本项目），改为各自加载仓库 `.env` 中的 `DEEPSEEK_API_KEY`，缺失时直接报错退出。这一项已修复。

剩下的只有一个输入问题：

**`translate_names.cjs`**
- 输入 `scripts/_missing_names.json` **不存在**，脚本无法启动。它是"名字计数"步骤的产物，而那一步没有留下脚本。重跑前需先重建该文件（世纪文件中的 `Name` 集合，减去 `polity_names_zh.json` 已有的键）。

**`translate_events.py`**
- 无阻塞项，但需要网络与 DeepSeek 额度；全量重跑 5000+ 个年份文件代价较高。

> 这两个脚本的产物（`polity_names_zh.json`、`events/`）当前数据是**完整且已通过校验**的，所以暂时不影响使用。

---

## generate/ — 大模型内容生成

| 脚本 | 用途 | 输入 | 输出 | 前置条件 | 状态 |
|------|------|------|------|----------|------|
| `generate-wars.mjs` | 生成战争档案（核心资料 + 进程时间线） | 声明清单（见下）、`.env` | `public/wars/profiles/*.json` + 重建 `index.json` | 智谱 key 或备用通道 | 可复现（补新战争需显式名单） |
| `generate-profiles.js` | 批量生成历史人物档案，支持断点续跑 | `people_list.txt`、`.env` | `public/people/profiles/*.json` | 智谱 key（5 个轮换） | 可复现（需额度） |
| `build_final_descriptions.cjs` | 合并多来源生成政区中文描述 | 世纪文件、名称映射、`/tmp/reusable_descs.json` | `public/ne/polity_descriptions.json` | — | **降级运行** |
| `pipeline.js` | 【已废弃】四阶段战争生成 | `war_list`（已不在仓库） | 战争档案 | 智谱 key | **已废弃** |

### 说明

**`generate-wars.mjs`（当前推荐）**
- 凭据只从 `.env` 读取，源码中不含任何密钥。
- **索引永远由档案反向重建**，因此索引与数据不可能不一致。
- 覆盖度按**战争中文名**对声明清单计算，文件按**英文名 slug** 命名，改名不会导致静默覆盖。
- 根目录的 `war_list.txt` 已删除（它与 `index.json` 命名体系长期不一致）。脚本的清单优先级是：`--war-list <path>` > 根目录 `war_list.txt`（若存在）> `public/wars/profiles/index.json` 的 `name` 字段。
- **回退到 `index.json` 时，`--dry-run` 恒报「没有缺口」**——索引是由档案反向重建的，无法凭它发现尚未建档的战争。要补新战争，必须给一份一行一个中文名的名单：`node scripts/generate/generate-wars.mjs --war-list <名单> --dry-run`。`--rebuild-index` 与 `--backfill-locations` 不受影响。
- 输出按严格 JSON 解析，**不做任何引号后处理**——历史上那次"把 JSON 引号替换成中文引号"的后处理，导致 1138 处数组塌缩和 96 处键值并入字符串（详见 `docs/项目设计文档.md` 6.7 节）。
- 多通道自动降级：智谱 key 报 `余额不足`（code 1113）即移出轮换，转而使用 `.env` 中的 `OPEN_API_KEY` 通道。
- 同时产出**战区中心坐标**，写入 `war_locations.json`。

**运行模式**

```bash
node scripts/generate/generate-wars.mjs --dry-run               # 只列出缺口
node scripts/generate/generate-wars.mjs --only 祖鲁战争          # 生成单个
node scripts/generate/generate-wars.mjs                         # 生成全部缺失
node scripts/generate/generate-wars.mjs --rebuild-index         # 仅由档案重建索引与坐标表
node scripts/generate/generate-wars.mjs --backfill-locations    # 为缺坐标的战争补中心点
node scripts/generate/generate-wars.mjs --backfill-locations --dry-run   # 只列出，不调用模型
node scripts/generate/generate-wars.mjs --war-list <名单文件>    # 指定新战争名单（一行一个中文名）
```

> `war_locations.json` 早于本脚本存在，原先只覆盖了近现代战争（89 场中 48 场），且部分坐标由模型猜测、落在海里。当前 94 场坐标已全部补齐，来源优先级为战役坐标中位数 > `theatreCentroid` > 既有值（见需求账本 R27）。`--backfill-locations` 会为缺坐标的战争补中心点，每回答一场就落盘一次，因此中断后可继续。
> 进度会追加写入 `.wars-generation.log`（已 gitignore）。

**`pipeline.js`（已废弃，保留仅作参考）**
- 按中文名匹配，改名的战争会被重复生成并覆盖已有档案。
- 第 3、4 阶段的 JSON 提取从未成功，时间线与深度分析实际上从未写入（见 `war_issue.md`）。

**`build_final_descriptions.cjs`**
- 依赖 `/tmp/reusable_descs.json`，该文件不存在。脚本用 `try/catch` 静默跳过，因此**不会报错，只会悄悄降低描述质量**——这类"静默降级"比直接失败更难发现。
- 若要重跑，需先决定现有 `polity_descriptions.json` 是否就是那个"可复用描述"来源。

---

## 环境变量

复制 `.env.example` 为 `.env` 并填入自己的凭据。`.env` 已在 `.gitignore` 中，**切勿提交**。

| 变量 | 用途 | 必需 |
|------|------|------|
| `ZHIPU_API_KEY_1` … `ZHIPU_API_KEY_5` | 智谱 GLM-4-Plus，战争/人物生成 | 与备用通道二选一 |
| `OPEN_API_KEY` / `OPEN_BASE_URL` | OpenAI 兼容的备用通道 | 与智谱二选一 |
| `DEEPSEEK_API_KEY` | DeepSeek 官方，翻译与描述生成 | 翻译脚本需要 |
| `QWEN_API_KEY` | 通义千问，人物生成的补充通道 | 可选 |
| `VITE_CESIUM_TOKEN` | Cesium Ion（当前实现不依赖 Ion，可不填） | 可选 |

> 注意：`.env` 中的现有键名是 `cesium_token`，而前端读取的是 `VITE_CESIUM_TOKEN`，两者对不上。当前前端不加载 Ion 资源，所以无影响；若将来需要 Ion 地形或影像，需要改成 `VITE_CESIUM_TOKEN`。

---

## 仓库卫生

历史调试产物原先散落在 `scripts/` 与 `scripts/data/` 中，共 13 个文件（约 90 KB），已归档到 `scripts/archive/`，不再干扰流水线目录：

| 文件 | 说明 |
|------|------|
| `*-timeline-debug.txt`、`*-tl-debug.txt`、`*-bat-debug.txt`、`*-battles-debug.txt` | 战争时间线解析失败的调试转储 |
| `伊拉克战争-raw.txt`、`西班牙内战-raw.txt` | 模型原始返回 |
| `.failed_core.txt`、`.failed_profiles.txt`、`.failed_wars.txt` | 历史失败记录 |

确认无用后可整目录删除。
