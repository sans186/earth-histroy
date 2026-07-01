# Earth Historical Timeline

基于 CesiumJS 的 3D 地球历史时间轴 —— 在虚拟地球上穿越人类文明史。

拖动底部时间轴从公元前 3100 年跨越至公元 2025 年，全球各地历史事件以彩色标记浮现于三维地球之上。历史政区边界随年份同步变换，国家名称标签浮动其上。点击标记弹出详情卡片，查看事件描述与历史来源。支持 4 种底图切换、8 类事件筛选、步进按钮、自动播放巡航、键盘操控。

## 技术栈

| 层面 | 选型 | 说明 |
|------|------|------|
| 3D 地球 | CesiumJS 1.123 | 开源标准底图默认（OSM），可切换卫星图 |
| 构建工具 | Vite 6 | 原生 ES 模块，零框架依赖 |
| 包管理 | npm | `cesium` 通过 npm 引入，Worker/Asset 通过 `vite-plugin-static-copy` 托管 |
| 代码规范 | ESLint 9 (flat config) + Prettier 3 | 零警告，覆盖 `src/` 和 `scripts/` |
| 历史事件 | 5236 份 JSON | 按年份索引（-3100 ~ 2025），位于 `public/events/` |
| 历史政区 | Cliopatria 数据集 | 15690 个政区实体（-3400 ~ 2024），按世纪分片 + 坐标抽稀 |
| 现代国界 | Natural Earth | 110m 国家面 + 50m 边界线，可独立叠加显示 |

## 项目结构

```
Earth/
├── index.html                         # 入口 HTML，含全局样式、加载/错误覆盖层、筛选栏、时间轴、事件卡片
├── package.json                       # 依赖与脚本
├── vite.config.js                     # Vite + Cesium 静态资源复制（Worker/Asset/Widget）
├── eslint.config.js                   # ESLint 扁平配置（browser + node scripts）
├── .prettierrc                        # Prettier 配置
├── data/
│   └── cliopatria_polities_only.json             # 原始 Cliopatria 完整数据（182MB，仅预处理用，不参与构建）
├── public/
│   └── ne/
│       ├── polities/                  # 55 个世纪分片 GeoJSON + index.json（坐标已抽稀）
│       ├── ne_110m_admin_0_countries.json       # 现代国家面（110m 分辨率）
│       ├── ne_50m_admin_0_boundary_lines_land.json  # 现代边界线（50m 分辨率）
│       └── cliopatria_polities_only.json         # 原始 Cliopatria 完整数据（182MB，仅预处理用）
├── scripts/
│   └── split-cliopatria.cjs           # 预处理：按世纪分片 + 坐标抽稀（每 5 点取 1）
└── src/
    ├── main.js                        # 应用入口：初始化 Core，注册 5 个插件，数据管线编排
    ├── config.js                      # 全局常量（Token、初始视角、分类颜色、时间范围等）
    ├── utils.js                       # 纯工具函数（formatYear、parseCoords、debounce、throttle）
    ├── core/                          # 微内核 — 应用骨架
    │   ├── index.js                   # Core 类：组装 Store + EventBus + Cesium Viewer
    │   ├── state.js                   # 响应式 Store（pub/sub）
    │   ├── event-bus.js               # 事件总线，插件间松耦合通信
    │   └── cesium-viewer.js           # Cesium Viewer 工厂函数
    ├── data/
    │   └── data-loader.js             # 数据加载器：LRU 缓存 + 6 并发 + AbortController + 容错
    └── plugins/                       # 功能插件 — 按职责拆分，仅通过 Store/EventBus 通信
        ├── map-plugin.js              # 事件标记实体管理、点击拾取、距离可见性、筛选重建
        ├── timeline-plugin.js         # 时间轴：滑块 + 步进按钮 + 播放控制 + 年份显示 + 键盘快捷键
        ├── filters-plugin.js          # 分类筛选复选框的渲染与状态同步
        ├── popup-plugin.js            # 事件详情卡片的显示/隐藏与内容填充
        └── layers-plugin.js           # 底图切换 + 历史政区边界同步 + 现代国界覆盖
```

## 架构设计

### 微内核 + 插件模式

```
┌──────────────────────────────────────────────────────────┐
│                         Core                              │
│  ┌─────────┐  ┌──────────┐  ┌──────────────────────────┐ │
│  │  Store  │  │ EventBus │  │     Cesium Viewer        │ │
│  │(状态存储)│  │ (事件总线)│  │   (3D 地球 + 数据源管理)  │ │
│  └────┬────┘  └────┬─────┘  └──────────┬───────────────┘ │
└───────┼────────────┼───────────────────┼─────────────────┘
        │            │                   │
   ┌────┴────┬───────┴───────┬───────────┴──────┬──────────┐
   │         │               │                  │          │
┌──┴──┐  ┌───┴──┐  ┌────────┴───┐  ┌──────────┴──┐  ┌────┴──────┐
│ Map │  │Time- │  │  Filters   │  │   Popup     │  │  Layers   │
│Plugin│  │line  │  │  Plugin    │  │  Plugin     │  │  Plugin   │
│     │  │Plugin│  │            │  │             │  │           │
└─────┘  └──────┘  └────────────┘  └─────────────┘  └───────────┘
```

**Store** — 响应式状态容器。`core.state.set('currentYear', 1500)` 自动通知所有订阅者。插件之间从不互相导入，仅通过 Store 和 EventBus 通信。

**EventBus** — 一次性事件通知。用于 `data:loaded`、`data:error`、`markers:count` 等瞬时信号，与"持久值变化"的 Store 互补。

**插件接口** — 每个插件导出 `{ name, install(core) }`。`install` 中注册状态监听、事件订阅、DOM 绑定和 Cesium 交互。添加新功能只需新增一个插件文件，不改 Core 或现有插件。

### 数据流（双管线并行）

```
用户操作（拖动滑块 / 点击步进按钮 / 键盘方向键）
  → core.state.set('currentYear', year)
    │
    ├─→ main.js 监听（debounced 100ms）
    │    → dataLoader.loadWindow(year, ±20)
    │      → 并发 fetch JSON（6 并发，LRU 缓存，过期 AbortController 取消）
    │      → 检查 content-type 防止 Vite SPA HTML 回退被误解析
    │      → core.state.set('dataEvents', events)
    │      → core.events.emit('data:loaded', events)
    │        → map-plugin 重建 Cesium 标记实体
    │          → 仅渲染 activeFilters 中的分类
    │          → 标记点 + 名称标签出现在地球上
    │          → core.events.emit('markers:count', { visible, total })
    │
    └─→ layers-plugin 监听（throttled 150ms）
         → loadCenturyFeatures(当前世纪 + 相邻世纪)
           → fetch 世纪 GeoJSON（原始 feature 数组缓存，非 Cesium DataSource）
           → 过滤 FromYear ≤ year ≤ ToYear 的政区
           → 按 Area 降序排列，取前 250 个（防 Cesium 实体溢出）
           → 构建 Blob URL → GeoJsonDataSource.load(url, style)
           → 添加名称标签（scaleByDistance 远处渐隐）
           → 添加到 viewer.dataSources
           → 淘汰远离当前窗口的世纪缓存
```

### 历史政区数据预处理管线

```
原始 Cliopatria GeoJSON (182MB, 15690 政区, MultiPolygon 占 55%)
  → scripts/split-cliopatria.cjs
    ├─ 按世纪窗口（100 年）分桶 → 55 个分片文件
    ├─ 坐标抽稀：每 5 个坐标点保留 1 个（减少 75% 坐标量）
    └─ 输出到 public/ne/polities/polities_{start}_{end}.json

运行时:
  年份变更
    → fetch 3 个世纪文件（当前 + 前后各 100 年）
    → 按 FromYear/ToYear 过滤 → 过滤后通常 50-200 个政区
    → 按面积取前 250 → Blob URL → GeoJsonDataSource.load → 添加到场景
```

## 关键问题与解决方案

### 坐标解析（parseCoords）

数据集中存在多种坐标格式，原始实现仅支持纯十进制，导致西经/南纬坐标会落在错误半球。

| 格式 | 示例 | 修复前 | 修复后 |
|------|------|--------|--------|
| 纯十进制 | `39.9, 116.4` | `[39.9, 116.4]` ✓ | `[39.9, 116.4]` ✓ |
| 度 + 方位 | `40°N, 7°W` | `[40, 7]` ✗ | `[40, -7]` ✓ |
| 显式负号 + 方位 | `17.0°N, -89.5°W` | `[17, -89.5]` ✓ | `[17, -89.5]` ✓ |
| 含括号注释 | `32.2°N, 48.3°E (Susa)` | `[32.2, NaN]` ✗ | `[32.2, 48.3]` ✓ |
| 分号多位置 | `0°S, 55°W（巴西）；8°N, 77°E（印度）` | 崩溃 ✗ | `[0, -55]`（取首个） ✓ |

修复方案：先剥离括号注释 → 取分号前第一部分 → 分别解析纬度和经度，识别 N/S/E/W 方向字符并应用正负号。

### Cesium "Too many properties to enumerate" 错误

**现象**：加载历史政区时 Cesium 渲染崩溃，抛出 `RangeError: Too many properties to enumerate`。

**根因**：Cliopatria 数据中 55% 的政区为 MultiPolygon 类型，Cesium 的 `GeoJsonDataSource` 会将每个子多边形拆分为独立实体，导致单年份实体数可达 800-1000 个，每个实体的 `PolygonHierarchy` 包含大量 `Cartesian3` 坐标，Cesium 内部属性枚举超出 V8 引擎限制。

**解决方案**：
1. **坐标抽稀**（`split-cliopatria.cjs`）：预处理时每 5 个坐标点保留 1 个，总坐标量减少 75%（189,661 → 46,975 per century），最大环从 583 点降至 118 点
2. **实体数量上限**（`layers-plugin.js`）：加载时按政区面积降序排列，最多取前 250 个，防止溢出
3. **Blob URL 加载**：将过滤后的 GeoJSON 序列化为 Blob URL 再传给 `GeoJsonDataSource.load()`，比直接传 JS 对象更可靠
4. **世代计数器**：`syncGeneration` 递增确保旧的异步加载结果不会覆盖新的

### 事件与时间不对应

**现象**：用户在某一年份看到的事件来自相差甚远的年代。

**根因**：
1. `YEAR_WINDOW` 原为 ±50 年（100 年跨度的窗口），所有窗口内事件同时显示
2. `main.js` 中 `activeFilters` 变化触发 `refreshNow` → `loadWindow` → 重复加载 + 重复实体重建
3. `markers:count` 发出时机与实体实际更新不同步

**解决方案**：
1. `YEAR_WINDOW` 缩小至 20（±20 年 = 40 年窗口），大幅减少"不对应"感
2. 移除 main.js 中的 `activeFilters` 监听 —— 筛选变化由 map-plugin 直接响应，不再重新走 `loadWindow`，避免双重建
3. `markers:count` 改为 map-plugin 在 `rebuildEntities` 后发出，确保计数与实际显示同步

### 历史政区不随年份变化 / 仅显示现代边界

**现象**：启动时或拖动时间轴后历史政区无显示，但现代边界切换正常。

**根因**：
1. 启动时硬编码 `syncPolitiesToYear(2025)`，而 Cliopatria 数据截至 2024 年，年份超出数据范围 → 过滤结果为空
2. 多边形填充 alpha 仅 0.08，描边 1px，在深色地球上几乎不可见
3. 传入 JS 对象给 `GeoJsonDataSource.load()` 在某些 Cesium 版本可能静默失败

**解决方案**：
1. 启动时读取 store 中的实际 `currentYear`，确保在数据范围内
2. 填充 alpha 提升至 0.15，描边加宽至 1.5px
3. 统一使用 Blob URL 方式加载，与该插件加载现代边界的方式一致
4. 添加"加载中..."状态提示，方便诊断

## 性能策略

| 问题 | 方案 |
|------|------|
| 5236 个事件 JSON 全部加载 | 按需窗口加载（±20 年），LRU 缓存上限 120 份 |
| 15690 个政区几何全部渲染 | 按世纪分片 + 按年过滤 + 坐标抽稀 75% + 上限 250 实体 |
| 政区 MultiPolygon 拆分后实体过多 | 按面积降序取前 250 个，防止 Cesium 属性枚举溢出 |
| 滑块快速拖动触发大量请求 | 事件 debounce 100ms，政区 throttle 150ms，过期请求 AbortController 取消 |
| 同一时间可见事件过多 | DistanceDisplayCondition 隐藏 9000km 外标记；scaleByDistance 远处缩小 |
| 政区名称标签过密 | scaleByDistance 控制标签可见距离（0.8M-5M km），远处渐隐 |
| 政区同步竞态 | syncGeneration 世代计数器丢弃过期异步结果 |
| 筛选切换时重复加载 | filter 变化由 map-plugin 直接刷新实体，不重新 fetch 数据 |
| 播放模式下数据预加载 | `preloadRange()` 后台静默预热后续范围 |

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 预处理政区数据（如重新获取了原始 Cliopatria 文件则执行）
node scripts/split-cliopatria.cjs

# 3. 启动开发服务器
npm run dev
# → 浏览器自动打开 http://localhost:3000

# 4. 生产构建
npm run build
npm run preview
```

## 可用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Vite 开发服务器（热重载） |
| `npm run build` | 生产构建 → `dist/` |
| `npm run preview` | 本地预览生产构建 |
| `npm run lint` | ESLint 静态检查（src/ + scripts/） |
| `npm run format` | Prettier 代码格式化 |

## 操作方式

| 操作 | 效果 |
|------|------|
| 拖动底部滑块 | 穿越时间线（-3100 ~ 2025） |
| ◀◀ / ◀ / ▶ / ▶▶ 步进按钮 | 跳转 -100 / -10 / +10 / +100 年 |
| ← → 方向键 | 快退/快进 50 年 |
| 空格键 | 播放 / 暂停自动巡航 |
| 点击地球彩色标记 | 弹出事件详情卡片（标题、年份、分类、描述、来源） |
| 点击卡片外或按 Esc | 关闭详情卡片 |
| 顶部筛选栏 | 按分类（8 种）显示/隐藏事件标记 |
| 右侧面板 — 底图 | 切换 OpenStreetMap / CartoDB / Cesium Ion 卫星 / ESRI 卫星 |
| 右侧面板 — 历史政区 | 显示/隐藏随时间变化的历史国界与名称标签 |
| 右侧面板 — 现代边界 | 叠加显示现代国家边界（独立于历史政区） |
| 鼠标左键拖拽 | 旋转地球 |
| 鼠标滚轮 | 缩放地球 |
| 右下角模式按钮 | 切换 3D 球体 / 2D 平面视图 |

## 数据格式

### 历史事件 (`public/events/{year}.json`)

```json
{
  "year": 1949,
  "year_label": "1949 CE",
  "era_context": "二战后世界格局重塑...",
  "documentation_level": "rich",
  "events": [
    {
      "id": "1949-001",
      "title": "中华人民共和国成立",
      "region": "China",
      "coordinates_approx": "39.9, 116.4",
      "category": "political",
      "description": "1949 年 10 月 1 日，毛泽东在天安门城楼宣告...",
      "key_figures": ["毛泽东", "周恩来"],
      "sources": [
        { "name": "中华人民共和国开国公告", "type": "primary_text", "contemporary": true }
      ]
    }
  ]
}
```

支持的分类（8 种）：`political`（政治）、`military`（军事）、`economic`（经济）、`cultural`（文化）、`exploration`（探索）、`demographic`（人口）、`social`（社会）、`technological`（科技）。

### 历史政区 (`public/ne/polities/polities_{start}_{end}.json`)

```json
{
  "type": "FeatureCollection",
  "properties": { "window_start": 1400, "window_end": 1500, "feature_count": 1099 },
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Polygon", "coordinates": [[[35.3, 17.9], ...]] },
      "properties": {
        "Name": "Alodia",
        "FromYear": 602,
        "ToYear": 1501,
        "Area": 123780,
        "Type": "POLITY",
        "Wikipedia": "Alodia",
        "SeshatID": "sd_alodia"
      }
    }
  ]
}
```

每个政区通过 `FromYear`/`ToYear` 标记存在年代。预处理时按 100 年窗口分桶，一个政区可能出现在多个世纪文件中。坐标已通过抽稀处理（每 5 点取 1），在保持地球级可视效果的同时将数据量减少 75%。

## 数据来源

| 数据集 | 来源 | 覆盖范围 | 说明 |
|--------|------|----------|------|
| 历史事件 | 自建数据集 | -3100 ~ 2025，5236 年 | 每年一个 JSON，每文件含若干事件条目 |
| 历史政区 | [Cliopatria](https://github.com/Seshat-Global-History-Databank/cliopatria) | -3400 ~ 2024，15690 政区 | 182MB 原始数据，已预处理为 55 个世纪分片 |
| 现代国界 | [Natural Earth](https://www.naturalearthdata.com/) | 当代 | 110m 分辨率国家面 + 50m 分辨率边界线 |

## 扩展指南

添加新功能（如 2D 时间对比视图、人物轨迹层）只需一步：

```js
// src/plugins/my-plugin.js
export default {
  name: 'my-plugin',

  install(core) {
    // 1. 监听状态变化
    core.state.on('currentYear', (year) => { /* ... */ });

    // 2. 监听瞬时事件
    core.events.on('data:loaded', (events) => { /* ... */ });

    // 3. 操作 Cesium Viewer
    // const viewer = core.viewer;
  },
};
```

然后在 `src/main.js` 中注册即可：

```js
import myPlugin from './plugins/my-plugin.js';
core.use(myPlugin);
```

无需修改 Core 或任何现有插件。

## 待补充

- **单元测试** — 核心工具函数（`parseCoords`、`formatYear`）和 Store/EventBus 适合优先覆盖
- **CI/CD** — 无自动构建/部署流水线
- **移动端适配** — 已有基础响应式样式，触摸交互（双指缩放、年份滑动）尚未适配
- **离线底图** — 当前底图均依赖在线瓦片服务，可考虑本地瓦片服务器以提高加载速度
- **政区数据构建压缩** — 已通过 `vite-plugin-compression` 在 build 时对 GeoJSON 进行 gzip 压缩
