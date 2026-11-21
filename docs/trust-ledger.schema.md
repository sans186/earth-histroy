# 可信度台账最小字段（trust ledger schema）

> 状态：**约定草案**。仅定义字段与判定口径，不修改 `public/`、不接门禁。
> 关联：AR-004、`scripts/data/validate-trust.mjs`、`src/lib/provenance.ts`、`docs/来源挂载清单.md`
> 日期：2026-11-21

---

## 1. 用途与边界

台账是一个**可选的旁路文件** `docs/trust-ledger.json`，用来记录每条数据「为什么可信、哪里有争议、给读者展示到什么程度」。它不替换 `public/` 里的数据，也不要求所有条目都入账。

- 台账不存在时，`validate-trust` 只统计数据内联的 `sources` 字段，并输出「台账未建立，按内联来源统计」。
- 台账存在时，仍以数据内联 `sources` 计算覆盖率，台账仅作对照与人工审阅依据。
- `--strict` 只是让脚本在覆盖率不足时返回退出码 1；**默认不阻断**，也不接入 `prebuild`。

---

## 2. 最小字段

文件顶层为 `{ "version": 1, "entries": [...] }`，脚本也接受裸数组。每条 `entries[]` 的最小字段如下：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | 是 | 数据条目的稳定 ID。事件用 `1912-001`；人物用 `personId`；战争用 `warId`。 |
| `type` | `"event" \| "person" \| "war"` | 是 | 条目所属数据集。 |
| `evidenceLevel` | `"R0" \| "R1" \| "R2" \| "R3"` | 是 | 证据强度，**数字越小越强**，与 `src/lib/provenance.ts` 的 `evidenceLevel()` 一致。 |
| `disputeLevel` | `"C0" \| "C1" \| "C2" \| "C3"` | 是 | 争议程度，与 `src/lib/provenance.ts` 的 `disputeLevel` 一致。 |
| `sources` | object[] | 是 | 可核验来源数组，至少 1 条；结构见 §3。没有可核验来源就写 `[]`，不允许省略字段。 |
| `displayMode` | `"full" \| "labelled" \| "summary" \| "hidden"` | 是 | 前端展示策略，见 §5。 |
| `reviewedAt` | string | 是 | 最近一次人工复核日期，ISO `YYYY-MM-DD`。 |
| `reviewer` | string | 是 | 复核人（姓名或账号）。 |
| `notes` | string | 否 | 补充说明：数据缺口、竞争性解释、为何降级展示。 |

`sources` 每条来源的最小子结构：

```json
{
  "kind": "wikipedia | wikiquote | britannica | scholarly | primary | institution",
  "title": "Abraham Lincoln",
  "url": "https://en.wikipedia.org/wiki/Abraham_Lincoln",
  "supports": "生平时间线 1809–1865"
}
```

`supports` 必填：写明该来源支撑条目的哪一段，避免「挂链接凑数」。

---

## 3. 等级口径

### evidenceLevel（证据强度）

沿用 `src/lib/provenance.ts` 的现行实现，**R0 最强、R3 最弱**：

| 等级 | 判定 | 含义 |
|---|---|---|
| `R0` | `sources` 中 ≥ 2 条带 `http(s)` 链接 | 多源可点开核验 |
| `R1` | 恰好 1 条带链接 | 单一可核验来源 |
| `R2` | 只有文献名，无链接 | 有出处但无法直接核验 |
| `R3` | `sources` 为空 | 无来源，通常为模型生成或待补 |

### disputeLevel（争议程度）

| 等级 | 判定 | 含义 |
|---|---|---|
| `C0` | 无评价、无语录等主观内容 | 学界叙述基本无分歧 |
| `C1` | 含评价/语录，或战争档案 | 细节或评价存在分歧，主线一致 |
| `C2` | 人物仍在世 | 生平与评价可能继续变化 |
| `C3` | 战争仍在进行（`endYear >= YEAR_MAX` 或在 `ONGOING_WAR_IDS`） | 结果与伤亡数字高度不确定 |

---

## 4. displayMode

| 值 | 行为 |
|---|---|
| `full` | 正文与评价完整展示。 |
| `labelled` | 展示，但标注「模型生成 / 存在争议 / 来源待补」。 |
| `summary` | 只展示摘要或时间线，隐藏评价与语录。 |
| `hidden` | 默认隐藏，需用户显式展开。 |

未入账的条目沿用现有运行时策略，不由台账推断。

---

## 5. 示例

```json
{
  "id": "abraham-lincoln",
  "type": "person",
  "evidenceLevel": "R0",
  "disputeLevel": "C1",
  "sources": [
    {
      "kind": "wikipedia",
      "title": "Abraham Lincoln",
      "url": "https://en.wikipedia.org/wiki/Abraham_Lincoln",
      "supports": "生平时间线 1809–1865"
    },
    {
      "kind": "britannica",
      "title": "Abraham Lincoln",
      "url": "https://www.britannica.com/biography/Abraham-Lincoln",
      "supports": "总统任期与遇刺经过"
    }
  ],
  "displayMode": "labelled",
  "reviewedAt": "2026-11-21",
  "reviewer": "data-review",
  "notes": "evaluation 三段为模型综述，暂只展示 objective；语录已有一手来源。"
}
```

---

## 6. 与校验脚本的关系

`node scripts/data/validate-trust.mjs` 只做覆盖率统计：

- 事件：`public/events/*.json` 与 `public/en-events/*.json` 的 `events[].sources`；
- 人物：`public/people/profiles/*.json` 的 `sources` / `evaluation.sources` / `quotes.sources`；
- 战争：`public/wars/profiles/*.json` 的 `sources`（字符串与对象两种格式都识别）。

需要逐条缺失 ID 时加 `--list-missing`；需要非零退出码时加 `--strict`。
