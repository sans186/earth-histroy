# Earth Historical Timeline — 全球历史时空可视化平台

基于 CesiumJS 的 3D 地球历史时间轴，在三维地球上穿越人类文明史。

> 在线演示：**[earth.tazume-sans.cn](https://earth.tazume-sans.cn/)**

## 快速开始

```bash
npm install
npm run dev     # → http://localhost:3000
npm run build   # 生产构建
npm run preview # 预览构建产物
```

开发者模式：访问 `http://localhost:3000/?dev=true` 打开可视化设置面板。

## 功能总览

### 核心功能

- **3D 地球** — CesiumJS 1.123，卫星/标准底图，鼠标拖拽旋转 + 滚轮缩放
- **时间轴** — 非线性分段滑块（公元前压缩、近现代拉伸）、步进按钮（1/5/10 年）、空格播放/暂停、方向键快进快退
- **8 时代导航** — 青铜时代→当代，分色导航条，一键跳转
- **历史事件标记** — 5236 个按年 JSON 文件，彩色 billboard 标记 + 名称标签
- **多维筛选** — 6 类事件（政治/军事/经济/文化/科技/探索），实时过滤
- **事件详情弹窗** — 点击标记显示标题、年份、分类、描述、来源链接
- **左侧事件面板** — 当前年份事件列表，点击飞向地点
- **历史政区边界** — Cliopatria 数据集（15690 政区），按世纪分片，随年份实时切换
- **政区信息卡片** — 点击政区显示国旗、首都、人口、面积、Wikipedia 摘要
- **现代国家边界** — Natural Earth 110m 国家面 + 50m 边界线
- **人物轨迹** — 历史人物生平路径可视化，步进导航 + 自动播放 + 详情卡片（含评价、语录）
- **2D/3D 视图切换** — MapLibre GL 平面视图，状态同步
- **中英文双语** — 政区名称、事件数据、UI 界面语言切换
- **地球背面标签剔除** — 点积判断，隐藏不可见面标签

### 主题系统

3 套内置主题，开发者可在设置面板中实时切换：

| 主题 | 风格 | 色调 |
|------|------|------|
| 蓝紫色 | 科技感深色科幻风 | 深蓝紫底 + 金色高亮 |
| 暖色古典 | 羊皮纸/古卷轴感 | 暖棕底 + 暗金/古铜点缀 |
| 水墨中国 | 黑白灰墨色极简 | 近黑底 + 灰白文字 + 淡色高亮 |

### 开发者设置面板

通过 `?dev=true` 参数启用，右下角齿轮按钮打开。7 大类别 35+ 可调参数：

| 类别 | 可调参数 |
|------|---------|
| 主题风格 | 3 套主题切换，实时预览 |
| 性能调试 | FPS 显示、Entity 计数、目标帧率、缓存大小、请求并发数 |
| 视觉效果 | 标记缩放、标签显隐、大气层、光照、太阳/月亮、星空、线框模式、抗锯齿、海洋颜色 |
| 时间线参数 | 播放速度、年份窗口、防抖延迟、默认步长、年份上下限 |
| 相机控制 | 默认经纬度/高度、飞行时长 |
| 数据源 | 中/英文数据路径、清除缓存 |
| 功能开关 | 历史政区、现代边界、人物轨迹、2D 默认、自动播放 |

**事务机制**：修改暂存，点击"保存"统一提交到 localStorage。`Ctrl+Shift+D` 开关面板，`Escape` 关闭。

## 操作方式

| 操作 | 效果 |
|------|------|
| 拖动滑块 | 穿越时间线（-3100 ~ 2025） |
| 步进按钮 / ← → 方向键 | 快退 / 快进 |
| 空格键 | 播放 / 暂停自动巡航 |
| 点击地球彩色标记 | 弹出事件详情卡片 |
| 点击政区多边形 | 弹出政区信息卡片 |
| 点击卡片外 / Esc | 关闭卡片 |
| 顶部筛选栏 | 按分类显示/隐藏事件 |
| 右侧面板 | 底图切换 / 历史政区 / 现代边界 / 2D3D切换 / 语言切换 |
| 左侧人物按钮 | 打开人物轨迹列表 |

## 技术栈

| 层面 | 选型 | 说明 |
|------|------|------|
| 3D 地球 | CesiumJS 1.123 | 开源 3D 地图引擎 |
| 2D 地图 | MapLibre GL 5.24 | Mapbox GL 开源分支，WebGL 渲染 |
| 构建工具 | Vite 6 | 原生 ES 模块 |
| 状态管理 | 自研 Store（pub/sub） | 轻量响应式状态容器 |
| 主题系统 | CSS Custom Properties | `var(--name)` 变量，:root 切换 |
| 代码规范 | ESLint 9 + Prettier 3 | |
| 事件数据 | 5236 个 JSON | 按年索引（-3100 ~ 2025） |
| 政区数据 | Cliopatria | 15690 政区，按世纪分片，坐标抽稀 |
| 现代国界 | Natural Earth | 110m 国家面 + 50m 边界线 |

## 项目结构

```
Earth/
├── index.html                    # 入口 HTML + CSS 变量 + UI 骨架
├── package.json
├── vite.config.js
├── eslint.config.js
├── .prettierrc
├── .env                          # Cesium Token 等环境变量
├── .gitignore
├── people_list.txt               # 人物轨迹生成用姓名列表
├── data/                         # 原始 Cliopatria 数据（仅预处理用，gitignored）
├── public/
│   ├── events/                   # 5236 份中文事件 JSON
│   ├── 英文event/                # 英文源文件
│   ├── ne/
│   │   ├── polities/             # 按世纪分片 GeoJSON
│   │   ├── ne_110m_admin_0_countries.json
│   │   ├── ne_50m_admin_0_boundary_lines_land.json
│   │   ├── polity_names_zh.json  # 政区中英文名映射
│   │   ├── polity_descriptions.json  # 政区描述（AI 生成）
│   │   └── polity_assets.json    # 国旗/首都/人口等资产
│   └── people/
│       └── profiles/             # 人物轨迹数据（AI 生成）
├── scripts/                      # 数据处理脚本（详见下方）
│   ├── data/                     # 数据预处理 & 修复
│   ├── fetch/                    # 外部数据抓取
│   ├── translate/                # 翻译脚本
│   └── generate/                 # AI 内容生成
└── src/
    ├── main.js                   # 应用入口（引导 Core + 注册插件）
    ├── config.js                 # 全局常量
    ├── utils.js                  # 工具函数
    ├── locale.js                 # i18n 字符串表
    ├── core/                     # 微内核
    │   ├── index.js              # Core 类
    │   ├── state.js              # 响应式 Store
    │   ├── event-bus.js          # 事件总线
    │   └── cesium-viewer.js      # Cesium Viewer 工厂
    ├── data/
    │   └── data-loader.js        # 数据加载器（LRU + 并发 + AbortController）
    ├── themes/
    │   └── themes.js             # 主题引擎（3 套主题 + CSS 变量管理）
    └── plugins/
        ├── map-plugin.js         # 事件标记实体管理
        ├── timeline-plugin.js    # 时间轴 UI
        ├── filters-plugin.js     # 分类筛选
        ├── popup-plugin.js       # 事件详情弹窗
        ├── event-panel-plugin.js # 左侧事件列表
        ├── layers-plugin.js      # 底图/政区/2D3D/语言
        ├── trajectory-plugin.js  # 人物轨迹可视化
        ├── map2d-renderer.js     # MapLibre 2D 渲染器
        └── dev-settings-plugin.js # 开发者设置面板
```

## 数据处理脚本

所有脚本位于 `scripts/` 目录，按用途分 4 类：

### data/ — 数据预处理 & 修复

| 脚本 | 说明 |
|------|------|
| `split-cliopatria.cjs` | 将 182MB 原始 Cliopatria JSON 按世纪切分为小块 GeoJSON，并做坐标抽稀 |
| `gen_name_zh.cjs` | 从 Natural Earth 数据 + 手工映射表生成政区中英文名对照 |
| `fix_china_territory.cjs` | 修复中国领土数据：移除 1950 年后台湾的独立政区条目，合并台湾几何到 PRC |
| `fix_zangnan.cjs` | 修复藏南（Arunachal Pradesh）领土数据，使用 turf.js 从印度多边形中提取并合并到 PRC |

### fetch/ — 外部数据抓取

| 脚本 | 说明 |
|------|------|
| `fetch_polity_descriptions.cjs` | 从 Wikipedia REST API 批量抓取政区摘要（英文 + 中文），输出 `polity_descriptions.json` |
| `fetch_country_assets.cjs` | 从 mledoze/countries 抓取现代国家资产（国旗 CDN URL、首都、人口、面积、货币等），输出 `polity_assets.json` |

### translate/ — 翻译

| 脚本 | 说明 |
|------|------|
| `translate_events.py` | 通过 DeepSeek API 将英文事件 JSON 翻译为中文，按年批量处理 5236 个文件 |
| `translate_names.cjs` | 翻译政区名称（Wikipedia 页面名 → 中文名），结合 NE 数据 + 手工映射 + 规则推导 |

### generate/ — AI 内容生成

| 脚本 | 说明 |
|------|------|
| `build_final_descriptions.cjs` | 生成政区中文描述（含详细/简短两层），合并 Wikipedia 摘要 + AI 内容 + 规则生成 |
| `generate-profiles.js` | 通过智谱（GLM-4）和千问（Qwen）API 批量生成历史人物生平轨迹 JSON，读取 `people_list.txt`，支持断点续传 |
| `enrich-trajectories.js` | 通过 DeepSeek API 丰富人物轨迹数据：为每个轨迹点生成介绍、著作、关联人物、历史背景 |

## 架构设计

### 微内核 + 插件模式

Core 持有 Store（响应式状态）+ EventBus（瞬时事件）+ Cesium Viewer。所有功能通过 `{ name, install(core) }` 接口注册为插件，彼此不直接引用，仅通过 Store/EventBus 通信。

### 数据流

```
用户操作（拖动滑块 / 步进 / 键盘）
  → core.state.set('currentYear', year)
    ├─ main.js 监听（debounced 100ms）
    │   → dataLoader.loadWindow(year, ±20)
    │     → 并发 fetch JSON（6 并发，LRU 缓存 120 份）
    │     → core.state.set('dataEvents', events)
    │     → map-plugin 重建 Cesium 标记实体
    │
    └─ layers-plugin（throttled 150ms）
        → 加载当前世纪 + 相邻世纪 GeoJSON
        → 过滤 FromYear ≤ year ≤ ToYear
        → 按面积排序取前 250 → 渲染为 Cesium 多边形 + 标签
```

### 主题系统

```
主题引擎 (src/themes/themes.js)
  → 定义 3 套 CSS 变量方案（blue / warm / ink）
  → applyTheme(id) → document.documentElement.style.setProperty(...)
  → 所有 UI 组件通过 var(--bg-primary) 等引用变量
  → 主题切换实时生效，无需刷新
  → localStorage 持久化当前选择
```

## 数据来源

| 数据集 | 来源 | 协议 | 覆盖范围 |
|--------|------|------|---------|
| 历史事件（英文源） | [Human History According to AI](https://github.com/Magnussmari/Human_history_Acording_to_AI) by Magnús Smári Smárason | CC BY 4.0 | -3100 ~ 2025，5236 年 |
| 历史事件（中文翻译） | 本项目通过 DeepSeek API 自行翻译 | CC BY 4.0（继承） | -3100 ~ 2025 |
| 历史政区 | [Cliopatria](https://github.com/Seshat-Global-History-Databank/cliopatria) | CC BY 4.0 | -3400 ~ 2024，15690 政区 |
| 政区中文描述 | 本项目通过 AI 生成 | — | ~15000 政区 |
| 人物轨迹 | 本项目通过 AI 生成 | — | ~300 历史人物 |
| 现代国界 | [Natural Earth](https://www.naturalearthdata.com/) | Public Domain | 当代，110m + 50m 分辨率 |
| 政区 Wikipedia 摘要 | [Wikipedia REST API](https://en.wikipedia.org/api/rest_v1/) | CC BY-SA 3.0 | 1452 政区中英文摘要 |
| 现代国家资产 | [mledoze/countries](https://github.com/mledoze/countries) + [FlagCDN](https://flagcdn.com/) | MIT / Public Domain | 201 现代国家国旗/首都等 |

> **署名要求**：历史事件数据（CC BY 4.0）使用时需注明原作者 Magnús Smári Smárason 及项目链接。

## 性能优化体系

| 问题 | 方案 |
|------|------|
| 5236 个事件 JSON | 按需窗口加载（±20 年），LRU 缓存 120 份 |
| 15690 个政区几何 | 按世纪分片 + 按年过滤 + 坐标抽稀 75% + 上限 250 实体 |
| MultiPolygon 实体溢出 | 按面积降序取前 250，Generation 计数器防止竞态 |
| 滑块快速拖动 | debounce 100ms + AbortController 取消 |
| 标记过密 | DistanceDisplayCondition 隐藏远距离标记 |
| 标签过密 | scaleByDistance 远处渐隐 + 密度预算动态裁剪 |
| Cesium 属性枚举溢出 | 坐标抽稀 + 实体上限 + Blob URL 加载 |
| 播放模式预加载 | preloadRange() 后台静默预热 |

## 待实现

1. **后端 + 数据库** — 引入 API 和 PostgreSQL，支持复杂时空查询
2. **对比模式** — 同屏两个年份分屏对比
3. **全局搜索** — `Ctrl+K` 跨事件/人物/地点搜索
4. **事件热力图** — 3D 地球上叠加空间密度可视化
5. **UGC 内容提交** — 用户补充/修正历史事件数据
6. **单元测试 / CI/CD** — 核心工具函数覆盖，自动构建部署

## 服务器部署

线上运行于阿里云轻量应用服务器（Ubuntu 22.04 + Nginx），子域名 `earth.tazume-sans.cn`，从 Gitee 仓库拉取代码并构建。

### 服务器架构

```
用户浏览器
  → https://earth.tazume-sans.cn (Nginx, 443 SSL)
    → /var/www/earth/dist/ (静态文件)
    或 SPA fallback → index.html

所有数据在构建时打包为静态 JSON，无需后端运行时。
```

| 组件 | 配置 |
|------|------|
| 服务器 | 阿里云轻量，Ubuntu 22.04，47.101.196.26 |
| Web 服务 | Nginx 1.18，SSL 证书由 Certbot (Let's Encrypt) 管理 |
| 静态目录 | `/var/www/earth/dist/` |
| Nginx 配置 | `/etc/nginx/sites-available/earth` → `sites-enabled/` |
| 代码仓库 | Gitee: `https://gitee.com/xsy_uiu/history-earth.git` |
| 运行时 | Node.js 20.x（仅构建时需要，运行时无依赖） |

### 首次部署

```bash
# 1. 服务器上安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 2. 克隆项目
sudo git clone https://gitee.com/xsy_uiu/history-earth.git /var/www/earth
sudo chown -R $(whoami):$(whoami) /var/www/earth

# 3. 安装依赖 + 构建
cd /var/www/earth
npm install
npm run build

# 4. 配置 Nginx
sudo cp /var/www/earth/deploy/nginx-earth.conf /etc/nginx/sites-available/earth
sudo ln -sf /etc/nginx/sites-available/earth /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 5. SSL 证书（需 DNS 已指向服务器）
sudo certbot --nginx -d earth.tazume-sans.cn

# 6. 权限收尾
sudo chown -R www-data:www-data /var/www/earth
```

### 日常更新

本地修改代码并推送到 Gitee 后，SSH 登录服务器执行：

```bash
cd /var/www/earth
sudo chown -R deploy:deploy /var/www/earth   # 解锁构建权限
git pull
npm run build                                 # 重新构建
sudo nginx -t && sudo systemctl reload nginx
```

或一键更新脚本：

```bash
# 在 /var/www/earth/ 下创建 update.sh
#!/bin/bash
set -e
cd /var/www/earth
sudo chown -R deploy:deploy /var/www/earth
git pull origin master
npm run build
sudo chown -R www-data:www-data /var/www/earth
echo "✅ Update complete: https://earth.tazume-sans.cn/"
```

### Nginx 配置要点

```nginx
# deploy/nginx-earth.conf 的关键配置：

# gzip_static: 直接返回构建时预压缩的 .gz 文件，零 CPU 开销
gzip_static on;

# COOP: 允许 Cesium Worker 使用 SharedArrayBuffer
add_header Cross-Origin-Opener-Policy same-origin;

# Cesium 静态资源长缓存（版本号文件名，永久不可变）
location /cesium/ { expires 30d; }
location /assets/ { expires 1y; }

# SPA 回退：所有路径交给 index.html
location / { try_files $uri $uri/ /index.html; }
```

> 注意：不要设置 `Cross-Origin-Embedder-Policy: require-corp`，这会阻止 Cesium 从外部 CDN 加载影像瓦片。

### 常见问题

| 问题 | 解决 |
|------|------|
| 地球不显示，只有文字标签 | Nginx 中检查是否误设了 `COEP: require-corp` |
| `git pull` 报 dubious ownership | `git config --global --add safe.directory /var/www/earth` |
| 构建后页面无变化 | 清除浏览器缓存，或检查 `dist/` 是否更新 |
| SSL 证书过期 | Certbot 自动续期，检查 `sudo certbot renew --dry-run` |
| 服务器上 `node` 命令不存在 | Node.js 未安装或版本不对，重新按上面步骤安装 |

## 参考文档

- [Human History According to AI](https://github.com/Magnussmari/Human_history_Acording_to_AI) — 事件数据源
- [全球历史时空可视化平台技术可行性分析报告](./docx_output.txt) — 项目规划依据
- CesiumJS 官方文档
- MapLibre GL 官方文档
