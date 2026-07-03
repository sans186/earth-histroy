# Earth Historical Timeline — 全球历史时空可视化平台

基于 CesiumJS 的 3D 地球历史时间轴，在三维地球上穿越人类文明史。

> 本项目是对《全球历史时空可视化平台技术可行性分析报告》的落地实现。报告建议的 Phase 1（3D 地球 + 时间轴联动 + 多维筛选 + 数据存储）已全部完成，部分 Phase 2 功能（2D/3D 视图切换）已提前交付。

## 现状 vs 报告建议

| 维度 | 报告建议方案 | 实际实现 | 状态 |
|------|------------|---------|------|
| 3D 引擎 | CesiumJS | CesiumJS 1.123 | ✅ |
| 时间轴 | HistropediaJS（非线性缩放） | 自研滑块 + 步进 + 播放 | ⚠️ 线性等距，待增强 |
| 多维筛选 | Crossfilter | 自研 Set 运算，8 分类 | ⚠️ 无交叉聚合 |
| 2D 地图 | Leaflet（Phase 2） | **MapLibre GL 5.24**（已实现） | 🔥 超预期 |
| 后端 | Python + FastAPI | **无后端，纯前端 JSON** | ❌ 架构取舍 |
| 数据库 | MySQL 8.0 | **JSON 文件系统（5236 个）** | ❌ 架构取舍 |
| 人物生平轨迹 | Phase 2 | **未实现** | ❌ |
| UGC / 编辑校验 | Phase 2 | **未实现** | ❌ |
| 自定义时间流速 | Phase 2 | **未实现** | ❌ |

**核心架构决策**：跳过后端 + 数据库，采用纯前端 + 静态 JSON 方案。这对个人开发者是合理的取舍——消除了最大复杂度来源，使项目在 1-2 个月内达到可演示状态。代价是无法支持复杂时空查询、用户系统和动态数据更新。

## 功能总览

### 已实现

- **3D 地球** — CesiumJS 1.123，4 种底图（标准/卫星），鼠标拖拽旋转 + 滚轮缩放
- **时间轴** — 滑块拖动、步进按钮（1/5/10 年）、空格播放/暂停、方向键快进快退、8 时代分色导航条
- **历史事件标记** — -3100 ~ 2025 年，5236 个 JSON 文件，彩色 billboard 标记 + 名称标签
- **多维筛选** — 8 类事件（政治/军事/经济/文化/探索/重要人物事迹/社会/科技）
- **事件详情弹窗** — 点击标记显示标题、年份、分类、描述、来源链接
- **左侧事件面板** — 当前年份事件列表，点击飞向地点
- **历史政区边界** — Cliopatria 数据集（15690 政区），按世纪分片 + 坐标抽稀，随年份实时切换
- **现代国家边界** — Natural Earth 110m 国家面 + 50m 边界线
- **2D/3D 视图切换** — MapLibre GL 平面视图，状态同步
- **中英文双语** — 政区名称、事件数据语言切换
- **地球背面标签剔除** — 点积判断，隐藏不可见面标签
- **自动播放巡航** — 40ms 间隔，预加载周边数据

### 性能优化体系

| 问题 | 方案 |
|------|------|
| 5236 个事件 JSON | 按需窗口加载（±20 年），LRU 缓存 120 份 |
| 15690 个政区几何 | 按世纪分片 + 按年过滤 + 坐标抽稀 75% + 上限 250 实体 |
| MultiPolygon 实体溢出 | 按面积降序取前 250，Generation 计数器防止竞态 |
| 滑块快速拖动 | debounce 100ms / throttle 150ms + AbortController 取消 |
| 标记过密 | DistanceDisplayCondition 隐藏 9000km 外标记 |
| 标签过密 | scaleByDistance 远处渐隐 |
| Cesium 属性枚举溢出 | 坐标抽稀（每 5 点取 1）+ 实体上限 + Blob URL 加载 |
| 坐标格式不统一 | 自研解析器支持 6 种格式（度分秒、N/S/E/W、括号注释等） |
| 播放模式预加载 | preloadRange() 后台静默预热 |

### 未实现（按优先级排列）

1. **非线性时间轴** — 当前滑块为线性等距，古代年份密度低、近现代密度高时体验不佳。需引入"分段缩放"概念
2. **后端 + 数据库** — 引入 Node.js/Python API 和 PostgreSQL/MySQL，支持复杂时空查询
3. **人物生平轨迹可视化** — 玄奘西行、苏轼辗转等路径在时空视图上渲染（掘金社区有成熟参考案例）
4. **自定义时间流速** — 允许用户调整播放速度
5. **UGC 内容提交** — 用户补充/修正历史事件数据
6. **单元测试 / CI/CD** — 核心工具函数覆盖，自动构建部署

## 技术栈

| 层面 | 选型 | 说明 |
|------|------|------|
| 3D 地球 | CesiumJS 1.123 | 开源 3D 地图引擎 |
| 2D 地图 | MapLibre GL 5.24 | Mapbox GL 开源分支，WebGL 渲染 |
| 构建工具 | Vite 6 | 原生 ES 模块 |
| 状态管理 | 自研 Store（pub/sub） | 轻量响应式状态容器 |
| 代码规范 | ESLint 9 + Prettier 3 | 零警告 |
| 事件数据 | 5236 个 JSON | 按年索引（-3100 ~ 2025） |
| 政区数据 | Cliopatria | 15690 政区，按世纪分片，坐标抽稀 |
| 现代国界 | Natural Earth | 110m 国家面 + 50m 边界线 |

## 项目结构

```
Earth/
├── index.html                    # 入口 HTML + 全局样式 + UI 骨架
├── package.json
├── vite.config.js
├── data/                         # 原始 Cliopatria 数据（182MB，仅预处理用）
├── public/
│   ├── events/                   # 5236 份中文事件 JSON
│   ├── 英文event/                # 英文源文件
│   └── ne/
│       ├── polities/             # 55 个世纪分片 GeoJSON
│       ├── ne_110m_admin_0_countries.json
│       ├── ne_50m_admin_0_boundary_lines_land.json
│       ├── polity_names_zh.json  # 政体中英文名映射
│       ├── polity_descriptions.json  # Wikipedia 摘要（1452 政区，中英双语）
│       └── polity_assets.json    # 政区资产数据（国旗/国徽/首都/面积等）
├── scripts/                      # 数据预处理 & 翻译脚本
└── src/
    ├── main.js                   # 应用入口（引导 Core + 注册插件）
    ├── config.js                 # 全局常量
    ├── utils.js                  # 工具函数
    ├── core/                     # 微内核
    │   ├── index.js              # Core 类
    │   ├── state.js              # 响应式 Store
    │   ├── event-bus.js          # 事件总线
    │   └── cesium-viewer.js      # Cesium Viewer 工厂
    ├── data/
    │   └── data-loader.js        # 数据加载器（LRU + 并发 + AbortController）
    └── plugins/
        ├── map-plugin.js         # 事件标记实体管理
        ├── timeline-plugin.js    # 时间轴 UI
        ├── filters-plugin.js     # 分类筛选
        ├── popup-plugin.js       # 事件详情弹窗
        ├── event-panel-plugin.js # 左侧事件列表
        ├── layers-plugin.js      # 底图/政区/2D3D/语言
        └── map2d-renderer.js     # MapLibre 2D 渲染器
```

## 架构设计

### 微内核 + 插件模式

Core 持有 Store（响应式状态）+ EventBus（瞬时事件）+ Cesium Viewer。6 个插件通过 `{ name, install(core) }` 接口注册，彼此不直接引用，仅通过 Store/EventBus 通信。

### 数据流

```
用户操作（拖动滑块 / 步进 / 键盘）
  → core.state.set('currentYear', year)
    ├─ main.js 监听（debounced 100ms）
    │   → dataLoader.loadWindow(year, ±20)
    │     → 并发 fetch JSON（6 并发，LRU 缓存）
    │     → core.state.set('dataEvents', events)
    │     → map-plugin 重建 Cesium 标记实体
    │
    └─ layers-plugin（throttled 150ms）
        → 加载当前世纪 + 相邻世纪 GeoJSON
        → 过滤 FromYear ≤ year ≤ ToYear
        → 按面积排序取前 250 → 渲染为 Cesium 多边形 + 标签
```

## 数据来源

| 数据集 | 来源 | 覆盖范围 |
|--------|------|---------|
| 历史事件 | 自建数据集 | -3100 ~ 2025，5236 年 |
| 历史政区 | [Cliopatria](https://github.com/Seshat-Global-History-Databank/cliopatria) | -3400 ~ 2024，15690 政区 |
| 现代国界 | [Natural Earth](https://www.naturalearthdata.com/) | 当代，110m + 50m 分辨率 |
| 政区描述 | [Wikipedia REST API](https://en.wikipedia.org/api/rest_v1/) | 1452 政区中英文摘要 |
| 政区资产 | [mledoze/countries](https://github.com/mledoze/countries) + [FlagCDN](https://flagcdn.com/) | 201 现代国家国旗/首都等 |

## 政区资产数据规范（polity_assets.json）

`public/ne/polity_assets.json` 为政区提供国旗、国徽、首都、面积等补充信息，点击政区卡片时展示。当前覆盖 **201 个现代国家**（数据来源：mledoze/countries + flagcdn.com），历史政区数据待扩充。

### 数据格式

以 **Wikipedia 页面名**（与 GeoJSON `properties.Wikipedia` 一致）为 key 的 JSON 对象：

```json
{
  "Germany": {
    "flag": "https://flagcdn.com/w320/de.png",
    "flagSvg": "https://flagcdn.com/de.svg",
    "shield": null,
    "shieldSvg": null,
    "capital": "Berlin",
    "population": null,
    "area": 357114,
    "currencies": ["Euro (€)"],
    "languages": ["German"],
    "cca2": "DE",
    "cca3": "DEU",
    "nameOfficial": "Federal Republic of Germany",
    "nameZh": "德国",
    "continent": "Europe",
    "subregion": "Western Europe",
    "source": "mledoze"
  }
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `flag` | `string|null` | 否 | 国旗 PNG 地址（推荐宽 320px） |
| `flagSvg` | `string|null` | 否 | 国旗 SVG 地址 |
| `shield` | `string|null` | 否 | 国徽 PNG 地址 |
| `shieldSvg` | `string|null` | 否 | 国徽 SVG 地址 |
| `capital` | `string|null` | 否 | 首都名称 |
| `population` | `number|null` | 否 | 人口数量 |
| `area` | `number|null` | 否 | 面积（km²） |
| `currencies` | `string[]|null` | 否 | 货币列表，格式 `"名称 (符号)"` |
| `languages` | `string[]|null` | 否 | 语言列表 |
| `cca2` | `string|null` | 否 | ISO 3166-1 alpha-2 代码 |
| `cca3` | `string|null` | 否 | ISO 3166-1 alpha-3 代码 |
| `nameOfficial` | `string|null` | 否 | 官方全称 |
| `nameZh` | `string|null` | 否 | 中文名称 |
| `continent` | `string|null` | 否 | 所属大洲 |
| `subregion` | `string|null` | 否 | 所属子区域 |
| `source` | `string` | **必填** | 数据来源标记 |

### `source` 字段取值规范

| 值 | 含义 | 用途 |
|----|------|------|
| `"mledoze"` | mledoze/countries 数据集 | 现代国家，自动获取 |
| `"restcountries"` | REST Countries API | 现代国家，备用数据源 |
| `"wikidata"` | Wikidata 结构化数据 | 历史政区旗帜(P41)/国徽(P94)，需脚本提取 |
| `"manual"` | 人工录入 | 无自动数据源的政区，手动添加 |

### 如何添加新数据

#### 方式一：重新运行自动采集脚本（覆盖已有数据）

```bash
node scripts/fetch_country_assets.cjs
```

脚本从 [mledoze/countries](https://github.com/mledoze/countries) 获取最新国家数据，自动匹配 Wikipedia 页面名，输出到 `public/ne/polity_assets.json`。如需增加新的 Wikipedia 名称→国家名映射，编辑脚本中的 `WIKI_TO_COMMON` 表。

#### 方式二：人工/脚本补充历史政区

直接编辑 `public/ne/polity_assets.json`，按相同格式添加条目。key 必须与 GeoJSON 中 `properties.Wikipedia` 完全一致。示例：

```json
{
  "Han dynasty": {
    "flag": "https://example.org/han_flag.png",
    "shield": null,
    "capital": "长安",
    "area": 6000000,
    "source": "manual"
  }
}
```

- 切勿删除已有的 key（会被自动脚本覆盖恢复）
- 建议先提 PR/MR 将新增条目合并，再运行自动脚本确保不丢失
- 历史政区无国旗是正常的——大部分古代政权没有现代意义的国旗，可以用 `shield`（纹章/国徽）替代

#### 方式三：Wikidata 批量提取（计划中）

未来可通过 Wikidata SPARQL 查询历史政区的 P41(flag)、P94(coat of arms)、P36(capital) 等属性，自动生成条目，标记 `"source": "wikidata"`。

### 卡片展示效果

点击政区多边形后弹出的信息卡片中，如存在 `flag`/`shield` 则显示对应图片，随后展示 Capital / Area / Lang 等统计行。无 assets 数据的政区回退到纯文字卡片（向后兼容）。

## 快速开始

```bash
npm install
npm run dev     # → http://localhost:3000
npm run build   # 生产构建
npm run preview # 预览构建产物
```

## 操作方式

| 操作 | 效果 |
|------|------|
| 拖动滑块 | 穿越时间线（-3100 ~ 2025） |
| ◀◀ / ◀ / ▶ / ▶▶ | 跳转 -100 / -10 / +10 / +100 年 |
| ← → 方向键 | 快退 / 快进 |
| 空格键 | 播放 / 暂停自动巡航 |
| 点击地球彩色标记 | 弹出事件详情卡片 |
| 点击卡片外 / Esc | 关闭卡片 |
| 顶部筛选栏 | 按分类显示/隐藏事件 |
| 右侧面板 | 底图切换 / 历史政区 / 现代边界 / 2D3D切换 / 语言切换 |

## 参考文档

- [全球历史时空可视化平台技术可行性分析报告](./docx_output.txt) — 项目规划依据
- CesiumJS 官方文档
- MapLibre GL 官方文档