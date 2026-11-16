# 部署到 Cloudflare Pages

本项目是纯静态站点，`npm run build` 产出的 `dist/` 可以直接上传，不需要服务器、数据库或服务端密钥。本文记录 Cloudflare Pages 的部署方式。

## 为什么用 Pages 而不是 GitHub Pages

| 项目特征（实测） | Cloudflare Pages 免费档 |
| --- | --- |
| `dist/` 约 224 MB、约 11,500 个文件、数据文件最大 18.38 MB | 20,000 文件/站、25 MiB/单文件，放得下；带宽与静态请求无限 |
| 代码里 `/events/`、`/cesium/` 等是硬编码绝对路径 | 默认 `*.pages.dev` 或自定义域名都在域名根，无需改代码 |
| 构建要跑数据校验、1,549 个模块并复制 Cesium 运行时 | 用 Direct Upload 传预先构建好的 `dist/`，跳过云端构建与超时 |
| `nginx-earth.conf` 配了 COOP 头、分路径缓存 | `public/_headers` 可在 Pages 上复刻同样的响应头 |

GitHub Pages 也能跑（绑自定义域名后即为根路径），但它不支持自定义响应头、缓存策略由平台固定、有 100 GB/月软带宽限制，且需要把 `dist/` 提交进仓库或用 Actions artifact 发布，流程更绕。

## 前置条件：需要账号授权

部署到你的 Cloudflare 账号必须有一次授权，这一步无法由脚本代劳。二选一：

### 方案 A：浏览器 OAuth（推荐，凭据不进聊天记录）

1. 到 <https://dash.cloudflare.com/sign-up> 注册免费账号（已有账号直接登录，Pages 免费档无需付费套餐）。
2. 在项目根目录执行 `npx wrangler login`，浏览器会打开授权页，点「Allow」即可。
3. 凭据保存在本机，之后部署不再需要重复登录。可用 `npx wrangler whoami` 验证。

### 方案 B：API Token（OAuth 不通时使用）

1. Cloudflare 控制台 → My Profile → API Tokens → Create Token → Create Custom Token。
2. 权限设为 `Account` / `Cloudflare Pages` / `Edit`，账户范围选你的账号；创建后复制 token。
3. 在项目根目录新建 `.dev.vars`（已被 gitignore，绝不要提交）：

   ```
   CLOUDFLARE_API_TOKEN=你的token
   CLOUDFLARE_ACCOUNT_ID=你的账户ID
   ```

   Account ID 可在控制台任一站点概览页右下角找到，或运行 `npx wrangler whoami` 查看。

脚本会自动读取 `.dev.vars`，但**不会打印其中的值**。

## 部署步骤

```bash
npm ci
EARTH_GZIP=0 npm run build        # prebuild 先跑数据校验；跳过仅 nginx 需要的 .gz
npm run deploy:cf -- --dry-run    # 只做发布前检查，不上传
npm run deploy:cf                 # 正式上传
```

`EARTH_GZIP=0` 是 Git Bash / macOS / Linux 写法；PowerShell 用 `$env:EARTH_GZIP = '0'; npm run build`，CMD 用 `set EARTH_GZIP=0 && npm run build`。不设这个变量，`dist/` 会多出 2,644 个用不到的 `.gz`（约 49 MB），仍在免费档限额内。此外 `public/` 里原本存有 110 个预压缩政区文件（自建 Nginx 的 `gzip_static` 需要它们），构建时也会复制进 `dist/`，因此 `deploy:cf` 命令已默认带上 `--strip-gz` 把它们一并清掉。

`deploy:cf` 会依次：

1. 校验 `dist/index.html` 与 `dist/_headers` 存在；
2. 删除 `dist/` 内所有 `.gz` 预压缩副本（Pages 会自行压缩响应，这些文件只会白占 20,000 文件配额）；
3. 检查文件总数 ≤ 20,000、单文件 ≤ 25 MiB、无 `.env` / `SERVER.md` / 日志 / 备份 / `.workbuddy/` 等私密或工作文件；
4. 调用 `npx wrangler pages deploy dist --project-name earth-histroy --branch main`。

可选参数：`--project <名称>` 改项目名、`--branch <分支>` 改生产分支、`--dry-run` 只检查。若直接运行 `node scripts/deploy/cloudflare-pages.mjs`（不经过 npm 命令），需自行加 `--strip-gz`。

首次部署会自动创建项目并给出 `https://earth-histroy.pages.dev` 一类的访问地址。之后每次执行都是一次新部署，可在控制台 Rollback 一键回退。

## 响应头与路由

- `public/_headers` 会被 Vite 原样复制进 `dist/`，Pages 解析后对静态资源生效：全局 COOP 与 nosniff、`/assets/*` 一年 immutable、`/cesium/*` 30 天、`*.json` 7 天。JSON 规则里的 `! Cache-Control` 用于清除前面规则叠加产生的冲突值。
- **故意不放 `_redirects`**：本项目没有前端路由，且数据文件缺失时应当返回真实的 404，让 `src/services/http.ts` 的 `allowMissing` 逻辑正确识别「某年份未提供」。若加 `/* /index.html 200`，缺失的 JSON 会变成 HTML 响应，反而破坏降级判断。
- HSTS 建议在 Cloudflare 控制台开启，不必写进 `_headers`。

## 自定义域名（可选）

Pages 控制台 → Custom domains → Set up a custom domain，按提示加 CNAME 即可，证书自动签发。绑定后站点仍在域名根，硬编码绝对路径照常工作。不绑定就直接用 `*.pages.dev` 地址。

## 注意事项

- **底图瓦片仍由访客浏览器直连 Esri ArcGIS**：换托管平台解决不了，客户端访问不到 `server.arcgisonline.com` 时只剩纯色地球和政区边界。
- `.dev.vars`、`.wrangler/` 均已 gitignore；任何 token 都不要写进仓库或聊天记录。
- 部署前确认 `dist/` 是由当前 HEAD 重建的：仓库里 `dist/` 被 gitignore，服务器上 `git pull` 拉不到它。
- 若要继续用自建 Nginx 部署，不要设 `EARTH_GZIP=0`——`gzip_static` 需要那些 `.gz` 文件。
- Cloudflare 官方目前建议新项目优先考虑 Workers Static Assets；Pages 仍可用，但若长期维护需留意其产品状态。
