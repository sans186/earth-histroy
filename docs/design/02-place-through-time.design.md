# 地名时空（Place Through Time）— 可实现级设计

> 原型：`Earth-prototypes/2026-11-18/new-sections/02-place-through-time.html`
> 定位：以「一个现代地名」为锚点，沿时间轴反查它当时落在哪个政区、归属如何变化、附近发生过什么。
> 范围说明：本文不含主题导览路线（该方向已搁置）。

---

## 0. 与原型的关键差异

| 原型假设 | 仓库现状 | 设计处理 |
| --- | --- | --- |
| 点击地图任意点即可反查 | 现有地图只提供政区面要素，无地名底表 | 新增「现代地名底表」作为唯一查询入口，再由点反查政区 |
| 事件自带经纬度 | `public/events/*.json` 共 17,998 条事件，其中 **17,585 条只有 `coordinates_approx` 字符串**（如 `"43.9°N, 18.4°E"`），**0 条有数值 `lat`/`lon`** | 新增坐标解析 + 派生索引，并把解析失败率作为可观测指标 |
| 政区随时段完整覆盖 | 分片为世纪粒度（55 片，`-3400..2100`），片内为静态面，时间分辨率只有「世纪」 | UI 明确以「世纪」为最小刻度，不伪造年内精度 |
| 地名可直接显示中文 | `polity_names_zh.json` 只有政区名，没有地名中文表 | 新增 `place_names_zh.json`，命中才显示，缺失回落英文，不做 AI 翻译 |

---

## 1. 数据来源与体量

### 1.1 A 类：公开数据 / 策展（可直接入库）

| 数据集 | 来源与许可 | v1 体量 | 说明 |
| --- | --- | --- | --- |
| 现代地名底表 `places/index.json` | Natural Earth 10m `populated places`（公有领域），约 7,342 点 | **3,000 条**（所有首都/省会 + `pop_max ≥ 50,000`） | 字段：name、iso 国家码、adm1、lat、lon、pop_max、featurecla、capital |
| 地名中文名 `places/names.zh.json` | 维基数据中文标签 / 维基百科标题（CC0 / CC BY-SA，需保留出处声明） | 3,000 条中预计命中 **2,200–2,600** 条 | 未命中留空，不做机器翻译 |
| 城市别称/历史旧名（可选） | 维基数据 `P1448` 官方名称、`P138` 命名自 | **0（v1 不做）** | 若做，也属公开数据，但需人工审核别名冲突 |
| 政区分片（已有） | 仓库现有 `public/ne/polities/*.lod.json` | 55 片 / **18,069 个面** | 不新增，仅消费 |
| 政区中文名（已有） | `public/ne/polity_names_zh.json` | 约 1,600 键（含大小写重复条目） | 查询需大小写不敏感，见 §5.4 |

### 1.2 B 类：构建期派生（不新增史实，只做计算）

| 产物 | 输入 | 体量 |
| --- | --- | --- |
| 城市×世纪归属索引 | 3,000 城市 × 55 分片 | **165,000 条记录**，压缩前约 **5–7 MB**，gzip 后约 **0.9–1.2 MB** |
| 事件坐标派生 | 17,998 条事件中的 17,585 条坐标串 | **约 17,600 条** `(eventId, lat, lon, precision)`，约 **1.2 MB** |
| 构建报告 `places/_report.json` | 上述两者 | < 200 KB：逐世纪命中率、落空城市 top 100、多点重叠样本 |

### 1.3 C 类：AI 生成（先单独列出，待评审，不进入 v1）

- 城市「一句话历史性格」文案（每城 1 句，3,000 条）。**不纳入。**
- 归属变化的因果解释（“因某战役而改属”）。**不纳入**，改为直接链接已有事件详情。

> 结论：本板块 v1 可以做到 **零 AI 新增历史内容**，全部为公开数据 + 机械派生。

---

## 2. 字段定义

### 2.1 `public/places/index.json`

```jsonc
{
  "version": 1,
  "source": "Natural Earth 10m populated places (public domain)",
  "places": [
    {
      "id": "ne:1159320495",        // 稳定主键：NE 原始 id，前缀化避免与政区冲突
      "name": "Sarajevo",
      "nameZh": "萨拉热窝",          // 可空
      "lat": 43.8563,               // 数值，WGS84，保留 4 位
      "lon": 18.4131,
      "pop": 419000,                // 可空；缺失置 null，不补 0
      "country": "Bosnia and Herzegovina",
      "iso": "BIH",                 // 可空
      "adm1": "Federation of Bosnia and Herzegovina",
      "capital": true,
      "cls": "Admin-0 capital"      // 原 featurecla，保留原值不做本地化
    }
  ]
}
```

### 2.2 `public/places/timeline/{shard}.json`（构建产物）

分片键：`id` 的 CRC32 % 16，共 16 个文件。

```jsonc
{
  "places": {
    "ne:1159320495": {
      "b": [                        // bands：按世纪升序、互不重叠
        { "c": -100, "p": "Roman Republic", "f": 1123 },  // c=世纪起点；p=政区名；f=面要素 id
        { "c": 600,  "p": "Byzantine Empire", "f": 48 }
      ],
      "gaps": [[-300, -200], [400, 500]],  // 该世纪无任何政区覆盖（海/无人区/数据缺口）
      "amb": [ { "c": 800, "n": 2 } ]      // 同世纪命中多个重叠面时的候选数，仅记录不选边
    }
  }
}
```

约束：

- `b[].c` 必须是 `-3400..2100` 内 100 的整数倍；同一 `c` 至多一条。
- 同一世纪命中多个面时，按 `polity_area_overrides` 的官方面积优先，其次按面积大者，候选写入 `amb`，UI 显示「近似」角标。
- 海岸/边界落空时，允许 25 km 半径内回落到最近面，标记 `near: true`，不写入 `p` 的正式归属文案。

### 2.3 `public/places/event_points.json`（构建产物）

```jsonc
{ "points": { "evt-1914-03": { "lat": 43.9, "lon": 18.4, "prec": 1 } } }
```

`prec`：0 = 精确到 0.1°，1 = 原文只有一位小数，2 = 解析降级（方位词/文案兜底），此条不参与半径检索。

### 2.4 解析规则（`coordinates_approx`）

支持 `43.9°N, 18.4°E`、`43.9N 18.4E`、`43.9° N, 18.4° E`；要求 N/S、E/W 各一，缺一即失败。解析失败进报告，不猜测。

---

## 3. 构建期产出

新增脚本（`scripts/data/`，与现有 `validate:data` 同一层）：

1. `build-places.mjs`
   - 输入：`data-src/ne/ne_10m_populated_places.geojson`（首次从 NE 下载，缓存到 `data-src/`，不提交原始大文件）
   - 过滤 + 排序（首都优先、人口降序）→ `public/places/index.json`
   - 合并 `data-src/wikidata/place-labels.zh.json` → `nameZh`
2. `build-place-timeline.mjs`
   - 对每个分片先建 `bbox` 数组，仅对 bbox 命中城市做 `booleanPointInPolygon`（`@turf/turf` 已是依赖）
   - 输出 16 个 `timeline/*.json` + `_report.json`
   - 必须打印：总点数、命中数、落空数、近岸回落数、多重命中数
3. `build-event-points.mjs`
   - 解析 `coordinates_approx` → `event_points.json`；失败清单写入报告，`validate:data` 对失败率设阈值（>3% 失败即报错）
4. 扩展现有 `scripts/data/validate-data.mjs`
   - `index.json`：id 唯一、lat ∈ [-90,90]、lon ∈ [-180,180]、name 非空
   - `timeline/*`：每个 `c` 有对应分片、`b` 有序、`p` 非空
   - 分片体积上限（单文件 gzip 前 ≤ 600 KB）

构建顺序：`build-places` → `build-place-timeline` → `build-event-points` → `validate:data` → `vite build`。

---

## 4. UI 规格与交互状态

### 4.1 布局（桌面 ≥ 1280）

```
┌ rail 280px ─────┬ stage flex ──────────────┬ detail 320px ──┐
│ 搜索框          │ 地图（2D/3D 复用现有）    │ 地点标题/坐标   │
│ 推荐地名 chips  │  · 当前政区面高亮         │ 当前世纪归属    │
│ 世纪滑杆        │  · 25km 回落圈（虚线）    │ 归属年代带      │
│ 年代刻度        │  · 附近事件点（可选开关） │ 附近事件列表    │
└─────────────────┴──────────────────────────┴────────────────┘
```

- 复用现有头图/底栏与设计 token（`src/styles/base.css`），不新造视觉体系。
- 世纪滑杆：`step=100`，与全局 `timeline.setYear` 双向绑定；拖动时 `setScrubbing(true)`，松手恢复。
- 年代带：横向色块，每块 = 一个世纪段；悬停显示「政区名 + 起止年」；点击跳到该世纪。
- `1200–1280`：detail 收窄到 280；`< 1024`：detail 变底部抽屉（默认 40% 高，可上拉）；`< 720`：rail 折叠为搜索栏 + 滑杆吸底。

### 4.2 状态机

| 状态 | 触发 | 表现 | 可执行动作 |
| --- | --- | --- | --- |
| `idle` | 首次进入 | rail 搜索框聚焦，stage 显示当前年政区 | 输入 / 选推荐 / 点地图 |
| `resolving` | 输入防抖 250ms 或点地图 | 列表显示 skeleton，stage 不动 | 取消 |
| `ready` | 命中 1 个地名 | 三段齐全，地图高亮当前面 | 拖滑杆 / 换世纪 / 看事件 / 分享 |
| `ready-near` | 仅近岸回落命中 | 归属卡显示「近岸近似」，虚线圈可见 | 同上，附「改用最近政区」 |
| `ambiguous` | 同世纪多个候选 | 归属卡列出候选（≤3），默认取面积最大并标「近似」 | 切换候选 |
| `no-polity` | 该世纪无面覆盖（gaps） | 归属卡显示「该世纪无政区记录」，年代带该段置灰 | 跳到相邻有记录世纪 |
| `not-found` | 搜索无结果 | 空态：建议改用「按坐标查询」 | 清空重输 |
| `error` | 分片加载失败 | detail 显示重试；stage 保持上一状态 | 重试 |

- 所有「近似/回落/多候选」必须在文案中显式标注，禁止静默取一个答案。
- 无障碍：滑杆 `role=slider` + `aria-valuetext="公元前 100 年"`；年代带为 `role=list`，每段可 Tab 聚焦；颜色不作为唯一区分（候选数量用文字徽标）。

### 4.3 文案口径

- 页脚固定声明：「归属按 Natural Earth 政区面与 Cliopatria 世纪分片近似判定，仅供历史学习，不代表任何主权主张。」
- 世纪精度声明：滑杆 tooltip 固定「世纪粒度（±50 年）」。

---

## 5. 接入点

| 现有模块 | 接入方式 | 改动量 |
| --- | --- | --- |
| `src/types/index.ts` | `ViewMode` 增加 `'place'` | 1 行 |
| `src/stores/ui.ts` | 增加 `focusedPlace: {id,name,lat,lon} \| null`、`setFocusedPlace()`；`setView('place')` 复用 | 小 |
| `src/stores/timeline.ts` | 直接复用 `setYear` / `setScrubbing` / `era`，不新增状态 | 无 |
| `src/App.vue` | 新增 `PlaceView.vue` 分支，与 About 页同一层路由方式 | 中 |
| `src/services/map2d.ts` | 复用 `polities` source：`setFeatureState({source:'polities', id})` 高亮；新增 `setFocusPoint(lon, lat, radiusKm)`（circle layer 或 marker）；新增事件点图层开关（复用 `events` source） | 中 |
| `src/services/globe.ts` | 复用现有政区高亮通道 + 新增一个跟随坐标的标记 | 中 |
| `src/components/PolityCard.vue` | 增加「此处今名」一行：由当前选中面 → 计算包含其质心的地名（需反查索引，见风险 R6） | 小 |
| `src/lib/eventLinks.ts` | 复用 `openEvent`，附近事件列表直接跳事件详情 | 无 |
| `src/lib/names.ts` | 地名→中文名查询必须走新增的 `placeNamesZh`，不要复用政区名表 | 小 |
| `src/lib/i18n.ts` | 新增约 25 个键（状态文案、免责、精度提示），中英各一份 | 小 |
| 分享 | URL `?view=place&place={id}&year={y}`，落地时同步 `setYear` + `setFocusedPlace` | 小 |

注意：政区名查找存在大小写敏感直查（`globe.ts`、`map2d.ts` 中 `names[name]`），本板块一律改用 `zhPolityName()` 归一接口，避免重蹈 `polity_names_zh.json` 去重导致的退化。

---

## 6. 分阶段落地

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| S1 数据底表 | `build-places.mjs` + 报告；3,000 条地名，中文命中率 ≥ 70% | 报告可复现，`validate:data` 通过 |
| S2 归属索引 | `build-place-timeline.mjs`，16 分片；逐世纪命中率入报告 | 总命中率 ≥ 92%；落空 top100 可解释；单分片 gzip ≤ 600 KB |
| S3 只读页面 | `PlaceView.vue`：搜索 + 归属卡 + 年代带，不含地图联动 | 八种状态均可复现；无地图依赖也能看结论 |
| S4 地图联动 | 高亮面、滑杆双向、近岸圈、事件点开关 | 拖动 10 次无闪烁；切世纪不重建地图 |
| S5 事件与分享 | 25 km 半径事件列表 + 深链接 | 17.6k 事件坐标解析失败率 < 3%；分享链接可直接还原 |

每阶段独立可用，S3 之后即使 S4 延期也能上线。

---

## 7. 主要风险

| # | 风险 | 影响 | 缓解 |
| --- | --- | --- | --- |
| R1 | 世纪分片间隙大（-300..-200、400..500 等无记录） | 用户误以为「没有政区」= 史实 | `gaps` 显式置灰 + 文案「记录缺失」与「无政区」分开 |
| R2 | 帽子重叠：同一世纪多个面覆盖同一点（帝国与附庸并存） | 归属结论被质疑 | 记录 `amb`，UI 列候选并标「近似」，不隐藏 |
| R3 | 海岸/边界点落空 | 沿海城市大量「无归属」 | 25 km 回落 + `near` 标记；报告量化 |
| R4 | 事件坐标是字符串且精度低（0.1°≈11 km） | 半径检索会把数百公里外事件算进来 | 固定 25 km 半径 + 显示「约」；`prec=2` 不参与 |
| R5 | 分片总量 165k 条，首屏并发请求 | 移动端卡顿 | 16 分片按需加载 + 结果缓存；只在选中地名后拉 1 个分片 |
| R6 | 「政区→今地名」反查需要对 18k 面算质心并与 3k 点求交 | 构建成本高、结果不稳 | 构建期预生成 `polity_centroid_place.json`，无命中留空；不在运行时算 |
| R7 | 现代地名引入现代政治实体（国家/首都） | 被解读为主权表态 | 只显示地名与坐标，国家字段仅作分组筛选，不参与归属结论 |
| R8 | Wikidata 中文名与常见译名不一致 | 观感差 | 保留 `name` 原文；中文名可空；抽检 100 条并允许人工覆盖表 |
| R9 | 历史地名（如君士坦丁堡）无法被现代名搜索 | 找不到 | v1 明确只支持现代名；旧名检索列入后续（属公开数据，非 AI） |
