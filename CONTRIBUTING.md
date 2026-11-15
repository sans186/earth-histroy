# 贡献指南

本项目是个人学习用的静态历史可视化实验，欢迎勘误与小改动，但**不接受大批量、无来源的 AI 重写**。

开始之前请先读 [`docs/开源说明.md`](./docs/开源说明.md)，尤其是数据可信度分级（§5）与争议处理口径（§6）。

## 提 Issue

### 数据勘误（最欢迎）

标题格式：`[数据勘误] <条目名> — <一句话问题>`

正文请包含：

1. **文件与字段**：例如 `public/people/profiles/dan-dong.json` 的 `nameEn`
2. **现在写的是什么**、**应该是什么**
3. **可核验来源**：权威工具书、上游原始数据集、学术论文或官方资料，附链接或准确书名
4. （可选）是否属于边界 / 命名 / 主权相关表述，便于按 §6.2 优先处理

没有来源的勘误会先被标记为 `needs-source`，不会直接改数据——因为我们没有能力裁定史实争议。

### Bug 与体验问题

请附：浏览器与版本、复现步骤、控制台报错、（如有）截图。移动端目前未适配，相关反馈会记录但不一定修。

## 提 PR

### 可以

- 修一条或一组有明确来源的数据错误
- 补一个条目的 `sources` / `alternativeNames`，并注明出处
- 修前端缺陷、补文档、改进脚本可复现性
- 补测试、CI 门禁、可访问性与国际化

### 不可以

- 用大模型批量重写人物评价、战争叙述或整份数据集
- 只凭印象改年份、坐标、人名
- 把个人政治立场写进 `evaluation.objective` 或 `legacy.significance`
- 提交 `.env`、密钥、服务器信息、`dist/`、本地快照
- 把 CC BY / CC BY-SA 数据的署名删掉

### 改动前请跑

```bash
npm run typecheck
npm run validate:data
npm run verify:smoke     # 需要构建产物与 Chromium 系浏览器
npm run build
```

改了 `public/people/profiles/*.json` 的生平坐标后，需要重建聚合表：

```bash
npm run build:people-coords
```

改了战争战役坐标后，需要重建 `public/wars/profiles/war_locations.json`（见 `scripts/generate/generate-wars.mjs --rebuild-index`）。

## 数据改动规范

- **一条改动一件事**，提交信息写清条目与来源，例如：
  `data: 修正 dan-dong 实体错认（来源：Encyclopaedia Britannica, "Georges Danton"）`
- 修正不抹历史：保留修正前后的 git 记录，并在 `docs/ai-generated-fields.json` 的 `fixes` 追加一条。
- 由模型生成或补写的字段，必须同时更新 `docs/ai-generated-fields.json`，让读者能分辨 curated 与 unverified 内容。
- 新增人物 / 战争请先讨论收录理由。默认不收录：近现代政治人物评价、在世人物、宗教创始人、进行中冲突的实时结论。

## 许可

提交 PR 即表示同意：代码部分按 MIT、数据部分按各自上游许可（`NOTICE`）发布；你确认所贡献内容有权这样授权。
