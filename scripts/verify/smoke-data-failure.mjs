/**
 * Reproducible failure-path smoke test.
 *
 *   npm run build
 *   npm run verify:smoke
 *
 * Serves `dist/` twice through a local HTTP server and drives a headless
 * Chromium browser against it:
 *
 *   pass 1 — two shipped JSON files answer 503. The app must retry, then show
 *            the shared error banner with both failing resources, while the
 *            rest of the interface still renders.
 *   pass 2 — everything answers 200. The banner must NOT appear.
 *
 * Needs a Chromium-based browser. Set EDGE_PATH / CHROME_PATH to override the
 * auto-detected path. The browser is only used with --dump-dom; no automation
 * framework or extra npm dependency is involved.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = path.join(ROOT, 'dist');
const INJECTED = new Set(['/events/1911.json', '/ne/polity_names_zh.json']);
const BANNER = '数据加载失败';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.gz': 'application/gzip',
};

function browserPath() {
  const candidates = [
    process.env.EDGE_PATH,
    process.env.CHROME_PATH,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  const hit = candidates.find((p) => fs.existsSync(p));
  if (!hit) {
    throw new Error('No Chromium-based browser found. Set EDGE_PATH or CHROME_PATH.');
  }
  return hit;
}

function serve(port, injectFailures) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      if (injectFailures && INJECTED.has(pathname)) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end('{"error":"injected by smoke test"}');
        return;
      }
      let file = path.resolve(DIST, `.${pathname}`);
      if (!file.startsWith(DIST)) {
        res.writeHead(403).end();
        return;
      }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        file = path.join(DIST, 'index.html');
      }
      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
        });
        res.end(data);
      });
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function domOf(url, browser, tag) {
  const profile = path.join(os.tmpdir(), `earth-smoke-${tag}-${process.pid}`);
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profile}`,
    '--window-size=1440,900',
    '--virtual-time-budget=14000',
    '--dump-dom',
    url,
  ];
  const { stdout } = await execFileAsync(browser, args, {
    maxBuffer: 16 * 1024 * 1024,
    timeout: 90_000,
    windowsHide: true,
  });
  return stdout;
}

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    throw new Error('dist/index.html is missing — run npm run build first.');
  }
  const browser = browserPath();
  console.log(`browser: ${browser}`);

  const results = [];
  let server = await serve(4173, true);
  try {
    const broken = await domOf('http://127.0.0.1:4173/', browser, 'broken');
    const showsBanner = broken.includes(BANNER);
    const showsRetries = broken.includes('已尝试 3 次') || broken.includes('3 attempt(s)');
    const stillUsable = broken.includes('本年条目');
    results.push(['503 注入后出现错误横幅', showsBanner]);
    results.push(['横幅记录重试次数（3 次尝试）', showsRetries]);
    results.push(['失败时界面其余部分仍可用', stillUsable]);
  } finally {
    server.close();
  }

  server = await serve(4174, false);
  try {
    const healthy = await domOf('http://127.0.0.1:4174/', browser, 'healthy');
    results.push(['正常加载时不误报', !healthy.includes(BANNER)]);
    results.push(['正常加载时应用可渲染', healthy.includes('本年条目')]);
  } finally {
    server.close();
  }

  for (const [name, ok] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  const failed = results.filter(([, ok]) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`smoke test failed: ${err.message}`);
  process.exitCode = 1;
});
