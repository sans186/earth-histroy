# 政区兴衰档案（Polity Lifecycle）— 可实现级设计

> 原型：`Earth-prototypes/2026-11-18/new-sections/03-polity-lifecycle.html`
> 定位：把一个政区从「首次出现 → 面积峰值 → 收缩 → 终结」讲成一条可交互的生命周期，并接上继任者、同期对手、相关战争与人物。
> 范围说明：本文不含主题导览路线（该方向已搁置）。

---

## 0. 与原型的关键差异

| 原型假设 | 仓库现状 | 设计处理 |
| --- | --- | --- |
| 每个政区都有完整世纪序列 | 55 个世纪分片（`-3400..2100`，共 18,069 个面），但同名政区可能只出现在少数世纪 | 序列允许缺口；缺口在曲线上断开，不插值 |
| 面积可直接画曲线 | 面积有三个来源：分片 `Area` 属性、`polity_area_overrides.json`（仅 **201 条**）、几何面积 | 明确优先级与图例标注，禁止混用不声明 |
| 阶段分期可直接讲 | 无任何分期数据 | 只用**规则化分期**（峰值/转折/收缩），并在 UI 标注「算法分段，非史学分期」 |
| 名称唯一 | `polity_names_zh.json` 约 1,600 键 vs `polity_descriptions.json` **1,971** 条 → 约 300+ 政区无中文名；且存在仅大小写不同的重复键 | 中文名走归一查找、缺失回落英文；同名异实体需显式拆分 |
| 关联战争/人物可直接列出 | 战争 98 份档案、人物 415 份，均为自由文本地点 | 采用「名称命中 + 世纪重叠」双条件匹配，匹配结果标置信度，不做模糊联想 |

---

## 1. 数据来源与体量

### 1.1 A 类：策展 / 公开数据（不新增史实）

| 数据集 | 现状 | 用途 |
| --- | --- | --- |
| 世纪政区分片 | 55 片 / 18,069 面 | 序列、面积、起止年 |
| `polity_descriptions.json` | 1,971 条（含简介与前身/后继） | 首屏一句话、继承关系 |
| `polity_facts.json` | 1,970 条 | 首屏要点 |
| `polity_assets.json` | 201 条 | 政区代表图/旗帜（有则显示） |
| `polity_area_overrides.json` | 201 条 | 权威面积（km²） |
| `polity_names_zh.json` | 约 1,600 键 | 中文名，需大小写归一 |
| 战争档案 `public/wars/profiles/` | **98 份** | 关联战争 |
| 人物档案 `public/people/profiles/` | **415 份** | 关联人物（需坐标落在政区面内） |

### 1.2 B 类：构建期派生（机械计算，非新增史实）

| 产物 | 计算方式 | 体量 |
| --- | --- | --- |
| `public/polities/lifecycles.json` | 按政区名聚合 55 分片的面积序列、起止、缺口 | **约 1,900 条**，单文件 **2.5–3.5 MB**，gzip 后 **600–900 KB** |
| `lifecycles/_index.json` | 名称 → 起止年、峰值、是否多实体 | 约 1,900 条，gzip 后约 120 KB |
| `polity_relations.json` | 前身/后继 + 同期存在且接壤/邻近的对手（按世纪 + 质心距离 ≤ 1500 km） | 约 1,900 × 平均 4 条 ≈ 7,600 条，约 900 KB |
| `polity_centroid_place.json` | 各政区峰值世纪面的质心 → 最近现代地名 | 18k 面 → 去重后约 1,900 条，约 200 KB |
| `lifecycles/_report.json` | 同名异实体候选、大小写重复、无中文名清单、面积突降 top 100 | < 300 KB |

### 1.3 C 类：AI 生成（先单独列出，待评审，不进入 v1）

- 「兴衰原因」段落（每政区 1–2 句因果解释）。**不纳入**：现有约束是暂不扩张 AI 生成的历史内容。
- 阶段命名（如「黄金时代」「动荡期」）。**不纳入**：v1 用中性编号 + 年份区间（如「阶段 2 · 1200–1450」）。
- 若未来评审通过，也只允许基于现有 `description` 改写，且必须挂 `provenance=ai` 徽标。

> 结论：v1 的「可读性」来自曲线与既有简介原文，不依赖任何新生成的历史叙述。

---

## 2. 字段定义

### 2.1 `public/polities/lifecycles.json`

```jsonc
{
  "version": 1,
  "polities": {
    "Byzantine Empire": {
      "nameZh": "拜占庭帝国",              // 可空；缺失回落 name
      "alt": ["Eastern Roman Empire"],     // 描述数据中识别出的别名
      "from": 330, "to": 1453,             // 来自描述/事实，缺失则由序列推断并标 inferred
      "inferred": { "from": false, "to": true },
      "areaSrc": "override",               // override | slice | geometry，全序列单一口径
      "series": [ { "c": 400, "a": 1750000, "f": 3 } ],  // c=世纪起点, a=km², f=该世纪面数
      "gaps": [[700, 800]],                // 该世纪无面
      "peak": { "c": 600, "a": 2100000 },
      "phases": [                          // 规则化分期，最多 4 段
        { "i": 1, "from": 330, "to": 600, "kind": "rise" },
        { "i": 2, "from": 600, "to": 900, "kind": "stable" },
        { "i": 3, "from": 900, "to": 1200, "kind": "shrink" },
        { "i": 4, "from": 1200, "to": 1453, "kind": "late" }
      ],
      "prev": ["Roman Empire"],
      "next": ["Ottoman Empire"],
      "conf": "high"                       // 名称归一匹配置信度
    }
  }
}
```

约束：

- `series[].a` 单位统一为 km²，保留整数；同一政区全序列只允许一种 `areaSrc`。
- `phases` 只允许 `rise | stable | shrink | late` 四种 `kind`，生成规则见 §3.2，不出现文学化命名。
- `from/to` 由序列推断时必须 `inferred=true`，UI 显示「约」。
- 同名异实体：若同一名称在序列中间出现 >200 年完全断档且面积量级相差 >3 倍，拆为 `Name (1)`/`Name (2)`，并在 `_report.json` 列明，禁止静默合并。

### 2.2 `public/polities/polity_relations.json`

```jsonc
{
  "Byzantine Empire": {
    "rivals": [ { "name": "Sassanian Empire", "c": [500, 600], "dist": 980 } ],
    "wars":   [ { "id": "war-1453", "year": 1453, "role": "defeated" } ],
    "people": [ { "id": "person-justinian", "year": 527 } ]
  }
}
```

`dist` 为峰值世纪质心距离（km），仅用于排序，不作为「接壤」证明；UI 文案统一写「同期邻近」。

### 2.3 关联匹配规则（可审计）

- 战争：政区名（含别名）出现在战争 `place`/`side` 文本中，且战争年份落在 `[from, to]` 内 → `conf=high`；仅名称命中 → `conf=mid`，UI 单独分组「可能相关」。
- 人物：人物 `points[].coords` 落入该政区任一分片面内，且年份落在生命周期内 → `conf=high`；否则仅同年份 → `conf=low`，不展示。
- 所有 `mid` 结果必须与 `high` 视觉分组，不可混排。

---

## 3. 构建期产出

### 3.1 脚本

`scripts/data/build-polity-lifecycles.mjs`

1. 遍历 55 分片，按 `name` 聚合（名称先做 `trim + 大小写归一`，保留原始拼写用于显示）。
2. 面积取值优先级：`polity_area_overrides` → 分片 `Area`（需统一单位：若为 km² 直接用，若为其他单位按分片元数据换算）→ `turf.area` 几何面积（仅兜底，标 `geometry`）。
3. 合并 `polity_descriptions`（简介、前身/后继）与 `polity_facts`。
4. 分期算法（纯规则）：
   - 峰值 = 序列面积最大世纪；
   - 连续 ≥3 个世纪面积下降且累计降幅 >35% → `shrink`；
   - 峰值前连续上升 → `rise`；其余段 `stable`；生命周期末 2 个世纪 → `late`；
   - 段数超过 4 时合并相邻同类。
5. 输出 `lifecycles.json`、`_index.json`、`polity_relations.json`、`polity_centroid_place.json`、`_report.json`。

`scripts/data/validate-data.mjs` 扩展：

- `series` 的 `c` 严格递增、`a > 0`、`areaSrc` 单值；
- `phases` 首尾与 `from/to` 对齐、`kind` 枚举合法；
- `next/prev` 必须指向存在的键（悬空引用报错）；
- 单文件体积上限：`lifecycles.json` gzip 前 ≤ 4 MB。

### 3.2 报告必须包含

| 指标 | 用途 |
| --- | --- |
| 唯一政区名数量、无中文名数量及清单 | 决定是否补名表 |
| 名称归一冲突（仅大小写不同、别名冲突） | 防止误合并 |
| 同名异实体拆分清单 | 人工复核 |
| 面积突降 top 100（相邻世纪跌幅 >50%） | 识别分片缺失或边界变化 |
| `override` / `slice` / `geometry` 三种口径的政区数 | 评估可比性 |

---

## 4. UI 规格与交互状态

### 4.1 布局（桌面 ≥ 1280）

```
┌ 头部 hero（全宽）: 政区名 · 中文名 · 起止年 · 峰值面积 · 面积口径徽标 ┐
├ 左 60%：领土快照 ────────────────┬ 右 40%：生命周期曲线 ──────────┤
│ 峰值世纪面（可切世纪）            │ SVG 面积折线（55 点，允许断点） │
│ 世纪滑杆 + 阶段按钮               │ 峰值标记、缺口阴影、当前点      │
├ 关联行（全宽）：前身/后继 → 对手 → 相关战争 → 相关人物 ┘
```

- 曲线用内联 SVG（不引图表库），横轴世纪刻度每 5 世纪一个标签，纵轴 km² 自适应但显示单位。
- 断点（`gaps`）用虚线连接并在下方标注「该世纪无记录」，不插值。
- 阶段按钮 4 个，等宽，点击把滑杆跳到该阶段中点世纪；当前阶段高亮描边。
- `< 1024`：曲线移到快照下方；关联行横向滚动；`< 720`：hero 精简为两行，阶段按钮变下拉。

### 4.2 状态机

| 状态 | 触发 | 表现 | 可执行动作 |
| --- | --- | --- | --- |
| `loading` | 首次进入 | hero skeleton + 曲线占位 | — |
| `ready` | 有 ≥3 个世纪数据 | 全部面板可见 | 滑杆 / 阶段 / 跳转 |
| `sparse` | 仅 1–2 世纪数据 | 曲线退化为点 + 文案「记录稀少，仅供参考」 | 查看原始分片年 |
| `gappy` | 缺口 >3 段 | 曲线断段 + 缺口说明 | 跳到最近有记录世纪 |
| `ambiguous` | 命中同名多实体 | hero 下显示实体选择（日期区间区分） | 切换实体 |
| `no-name-zh` | 无中文名 | 标题只显示英文，不显示占位符 | — |
| `no-relations` | 无战争/人物匹配 | 该行显示「暂无高置信关联」，不展示低置信项 | — |
| `error` | 数据加载失败 | 整页错误卡 + 重试 | 重试 |

无障碍：曲线提供 `role=img` + 文字摘要（起止、峰值世纪、阶段数）；滑杆 `aria-valuetext` 同地名时空；阶段按钮为 `role=tablist`。

### 4.3 文案口径

- 面积徽标三态：`权威面积`（override）/ `分片面积`（slice）/ `几何估算`（geometry），悬停解释差异。
- 分期说明：「阶段由面积变化规则自动划分，不代表史学分期。」
- 关联说明：「关联战争/人物按名称与年份匹配，分高置信与可能相关两组。」

---

## 5. 接入点

| 现有模块 | 接入方式 | 改动量 |
| --- | --- | --- |
| `src/types/index.ts` | `ViewMode` 增加 `'polity'`；新增 `PolityLifecycle` 类型 | 小 |
| `src/stores/ui.ts` | `focusedPolity: string \| null`、`setFocusedPolity()`；复用 `setView` | 小 |
| `src/stores/timeline.ts` | 复用 `setYear` / `era`；阶段按钮/滑杆都落到 `setYear` | 无 |
| `src/App.vue` | 新增 `PolityLifecycleView.vue` | 中 |
| `src/components/PolityCard.vue` | 卡片底部新增主按钮「查看兴衰档案」→ `setFocusedPolity(name)` + `setView('polity')`；这是本板块的主入口 | 小 |
| `src/services/map2d.ts` | 复用 `polities` source 的 `setFeatureState` 高亮；曲线悬停世纪 → `setYear` → 地图自动换片 | 小 |
| `src/services/globe.ts` | 同上，3D 侧复用现有高亮通道 | 小 |
| `src/components/WarCard.vue` | 战争结果里的政区名可点击跳转档案（仅 `conf=high`） | 小 |
| `src/components/PersonCard.vue` | **暂不改**：该文件在返工中 | 0 |
| `src/lib/names.ts` | 中文名统一走 `zhPolityName()`；档案标题不直接索引 `names[name]` | 小 |
| `src/lib/compare.ts` / `CompareBoard.vue` | **暂不改**：返工中；后续再接「同期对手加入对照」 | 0 |
| `src/lib/i18n.ts` | 新增约 20 个键（阶段、口径、置信度、空态） | 小 |
| 深链接 | `?view=polity&name={urlencoded}&year={y}` | 小 |

---

## 6. 分阶段落地

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| S1 数据聚合与审计 | `build-polity-lifecycles.mjs` + `_report.json`；先只出报告不接 UI | 唯一名称数、无中文名数、拆分清单可人工复核；`validate:data` 通过 |
| S2 只读档案页 | hero + SVG 曲线 + 阶段按钮（不含地图） | 七种状态可复现；断点不插值；体积 gzip ≤ 900 KB |
| S3 地图联动 | 滑杆/悬停世纪驱动地图换片与高亮 | 切世纪无重建；与全局时间轴双向一致 |
| S4 关联关系 | 前身/后继、战争、人物三行接入，高/中置信分组 | 悬空引用 0 条；`mid` 不混入 `high` |
| S5 入口与分享 | PolityCard 主按钮、WarCard 跳转、深链接 | 从卡片 2 步内到达；冷启动可直接还原 |

S1 的报告本身就是可交付物：即使 UI 延期，也能据此决定要不要补中文名表。

---

## 7. 主要风险

| # | 风险 | 影响 | 缓解 |
| --- | --- | --- | --- |
| R1 | 名称归一误合并（同名不同实体） | 曲线出现不存在的历史断裂或虚假连续 | 断档 + 量级双阈值拆分；报告列清单；UI 支持实体切换 |
| R2 | 三种面积口径混用 | 曲线不可比，用户误读 | 单政区单口径 + 头部徽标 + 悬停解释 |
| R3 | 世纪分片本身有覆盖缺口 | 曲线断段被当成「灭亡」 | 断点虚线 + 「无记录」标注；与 `from/to` 区分 |
| R4 | 算法分期被误读为史学结论 | 学术性投诉 | 中性命名、固定免责句、阶段仅作导航 |
| R5 | 300+ 政区无中文名 | 中英混排观感差、搜索不到 | 回落英文；报告清单驱动补名（公开数据，可策展）；不做机器翻译 |
| R6 | `lifecycles.json` 3 MB 首屏加载 | 移动端慢 | 先载 `_index.json` 渲染骨架，按需载单条；或按首字母拆 8 片 |
| R7 | 战争/人物关联靠文本匹配 | 误报 | 双条件 + 置信度分组；低置信不展示 |
| R8 | 击中同名大小写变体导致序列被拆成两条 | 曲线减半 | 归一键统一（复用 `zhPolityName` 的归一逻辑），显示保留原拼写 |
| R9 | 与「地名时空」共用世纪滑杆但语义不同 | 用户混淆 | 两页滑杆标注不同：地名页「世纪（±50 年）」，档案页「阶段/世纪」 |
