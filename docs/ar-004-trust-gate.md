# AR-004 可信度门禁 dry-run 报告

> 状态：AR-004 仍为**「待确认」**。本报告只做 dry-run 与建议，不接 `prebuild`、不改 CI。
> 关联：AR-004（[11-AI建议需求.md](./协作开发/11-AI建议需求.md)）、AR-013、UR-013
> 实测日期：2026-11-21　环境：Node v24.14.0 / Windows
> 相关文件：`scripts/data/validate-trust.mjs`、`docs/trust-ledger.schema.md`、`docs/trust-ledger.json`

---

## 1. 脚本行为（读代码确认）

- 只统计，不写数据、不访问网络；覆盖率按数据集**内联 `sources`** 计算，台账只作对照。
- 默认**不阻断**：无论覆盖率多少都返回退出码 0。
- 只有 `--strict` 才在任一类别低于 `STRICT_MIN = 100`（代码硬编码 100%）时返回退出码 1。
- `--list-missing` / `--missing` 额外打印逐条缺失 ID。
- 台账存在时输出「台账已建立：N 条」；不存在时输出「台账未建立，按内联来源统计」。台账的存在**不会**改变覆盖率数值。

---

## 2. 台账现状

按 `docs/trust-ledger.schema.md` 新建了空台账：

```json
{
  "version": 1,
  "entries": []
}
```

JSON 不支持注释，因此「没有记录 = 未人工复核」这一口径只能写在文档里（本节与 [review-plan.md](./review-plan.md) 第 4 节），不写入 JSON。当前 `entries` 为空，表示**全库尚无任何条目完成人工复核**；覆盖率数字不代表已复核，只代表是否挂了 `sources` 字段。

---

## 3. 两次运行结果

| 命令 | 退出码 | 台账提示 |
|---|---:|---|
| `npm run validate:trust` | **0** | 台账已建立：0 条；覆盖率仍按内联 `sources` 统计 |
| `node scripts/data/validate-trust.mjs --strict` | **1** | 同上；严格模式判定 3 个类别未达 100% |

### 3.1 覆盖率

| 类别 | 总数 | 含 sources | 覆盖率 |
|---|---:|---:|---:|
| 事件（中文） | 17,998 | 17,971 | 99.8% |
| 事件（英文） | 17,998 | 17,971 | 99.8% |
| 人物档案 | 415 | 8 | **1.9%** |
| 战争档案 | 96 | 96 | 100.0% |

- 人物来源字段只有 `quotes.sources`（8 份），`sources` / `evaluation.sources` 为 0。
- 战争来源格式：纯字符串 252 条，结构化对象 43 条，混用档案 0 份。

### 3.2 缺失清单规模

| 类别 | 缺失条数 |
|---|---:|
| 事件（中文） | 27 |
| 事件（英文） | 27 |
| 人物档案 | **407** |
| 合计 | **461** |

事件缺失 ID 两侧同构（如 `-1977-001`、`-80-003`），共 27 组；人物缺失覆盖绝大多数档案。`--strict` 失败的直接原因是人物档案 1.9%，事件 99.8% 同样会被 100% 阈值判失败。

---

## 4. 结论与建议

**当前不建议把 `validate:trust` 接进 `prebuild` 做强制门禁。** 理由：

1. 人物档案覆盖率 1.9%，接入即意味着每次构建失败；补齐 407 份人物的来源是数据工作，不是一次脚本接线。
2. `--strict` 阈值硬编码 100%，连 99.8% 的事件也会失败；在阈值可配置（或按类别分别设阈值）之前，严格模式没有可操作性。
3. 台账 `entries` 为 0，此时门禁只能校验「有没有挂 sources」，无法反映人工复核质量，容易催生「为过门禁而挂链接」。

**建议先在 CI 里以非阻断方式观察**（本次不修改 `.github/workflows/ci.yml`，AR-001/CI 由主控另行安排）：

- 在现有 `Validate data` 步骤之后增加一个 `continue-on-error: true` 的观察步骤：
  ```yaml
  - name: Trust coverage (observe only)
    run: node scripts/data/validate-trust.mjs --list-missing
    continue-on-error: true
  ```
- 或本地/定时观察，把输出留档：
  ```bash
  npm run validate:trust
  node scripts/data/validate-trust.mjs --list-missing
  ```
- 观察期目标：人物覆盖率与缺失清单规模不再恶化；台账出现真实 `entries` 后，再讨论阈值（例如先对战争、事件设 100%，人物单独设阶段目标）。

**未来接入 `prebuild` 的前置条件**（满足后再由用户拍板）：

1. 人物档案覆盖率有明确提升路径（或 `--strict` 支持按类别设阈值）；
2. 台账有足量真实记录，能区分「挂了 sources」与「人工复核过」；
3. CI 观察期至少一个迭代无新增缺失。

---

## 5. 边界

- 未修改 `prebuild`、`.github/`、`package.json`、`public/`、`src/`。
- 未虚构任何台账条目；空台账即「全库未人工复核」。
- AR-004 状态维持「待确认」，是否接门禁、阈值如何定由用户拍板。
