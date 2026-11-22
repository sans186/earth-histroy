#!/usr/bin/env node
/**
 * Deploy dist/ to Cloudflare Pages with Wrangler Direct Upload.
 *
 * Usage:
 *   npm run deploy:cf                          preflight checks + deploy
 *   npm run deploy:cf -- --dry-run             preflight checks only
 *   npm run deploy:cf -- --project <name>      override project name
 *   npm run deploy:cf -- --branch <branch>     override production branch
 *   npm run deploy:cf -- --strip-gz            remove leftover .gz copies
 *                                              (only after every check passed;
 *                                              --dry-run never removes anything)
 *
 * Build for Pages with `EARTH_GZIP=0 npm run build`: Vite then omits the .gz
 * copies that only nginx's gzip_static can use. Cloudflare compresses on its
 * own, so shipping those files wastes 2,644 of the 20,000 allowed files.
 *
 * Authentication (either one, never commit credentials):
 *   1. `npx wrangler login` - browser OAuth, the token stays on this machine.
 *   2. CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in the environment, or in
 *      a gitignored .dev.vars file at the repository root. This script loads
 *      that file but never prints its values.
 *
 * Why Direct Upload: the build already runs data validation, bundles 1,549
 * modules and copies the Cesium runtime. Doing that inside a hosted build
 * risks timeouts and burns the 500 deploys/month quota.
 */

import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const DIST = join(ROOT, 'dist');

const FILE_LIMIT = 20_000;
const SIZE_LIMIT = 25 * 1024 * 1024; // Cloudflare Pages: 25 MiB per file
const DEFAULT_PROJECT = 'earth-histroy';
const DEFAULT_BRANCH = 'main';

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const valueOf = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const dryRun = has('--dry-run');
const stripGz = has('--strip-gz');
const project = valueOf('--project', process.env.CF_PAGES_PROJECT || DEFAULT_PROJECT);
const branch = valueOf('--branch', process.env.CF_PAGES_BRANCH || DEFAULT_BRANCH);

const prettyBytes = (n) => (n / 1024 / 1024).toFixed(1) + ' MB';
const fail = (msg) => {
  console.error('\n[deploy] ABORT: ' + msg + '\n');
  process.exit(1);
};

/** Read KEY=VALUE lines from .dev.vars without ever echoing the values. */
function loadDevVars() {
  const file = join(ROOT, '.dev.vars');
  if (!existsSync(file)) return;
  let loaded = 0;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (process.env[key] !== undefined) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
    loaded += 1;
  }
  if (loaded) console.log(`[deploy] loaded ${loaded} variable(s) from .dev.vars`);
}

/** Walk dist/ and return every file with its size. */
function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (entry.isFile()) out.push({ path: full, size: statSync(full).size });
  }
  return out;
}

const SENSITIVE = [
  /^\.env/i,
  /^SERVER\.md$/i,
  /\.log$/i,
  /\.pem$/i,
  /\.key$/i,
  /backup/i,
  /cliopatria_polities_only/i,
];

function preflight() {
  if (!existsSync(join(DIST, 'index.html'))) {
    fail('dist/index.html not found. Run `npm run build` first.');
  }
  if (!existsSync(join(DIST, '_headers'))) {
    fail('dist/_headers not found. Rebuild so that public/_headers is copied.');
  }

  const all = listFiles(DIST);
  const gzFiles = all.filter((f) => f.path.endsWith('.gz'));
  /*
   * Check the set that would actually be uploaded. --strip-gz only removes the
   * .gz sidecars, so the limits are evaluated without them. Removing first and
   * validating afterwards (the previous order) wiped those copies from dist/
   * even when the run then aborted, and --dry-run wiped them too.
   */
  const upload = stripGz ? all.filter((f) => !f.path.endsWith('.gz')) : all;

  const totalBytes = upload.reduce((sum, f) => sum + f.size, 0);
  const largest = upload.reduce((a, b) => (b.size > a.size ? b : a), upload[0]);
  const oversized = upload.filter((f) => f.size > SIZE_LIMIT);
  const sensitive = upload.filter((f) => {
    const rel = relative(DIST, f.path).replace(/\\/g, '/');
    return SENSITIVE.some((re) => re.test(rel)) || rel.startsWith('.workbuddy/');
  });
  const gzBytes = gzFiles.reduce((s, f) => s + f.size, 0);

  console.log('\n[deploy] Preflight');
  console.log(`  project        : ${project} (branch: ${branch})`);
  console.log(`  files          : ${upload.length.toLocaleString()} / ${FILE_LIMIT.toLocaleString()}`);
  console.log(`  total size     : ${prettyBytes(totalBytes)}`);
  console.log(`  largest file   : ${prettyBytes(largest.size)}  ${relative(DIST, largest.path)}`);
  console.log(`  .gz copies     : ${gzFiles.length} (${prettyBytes(gzBytes)})`);
  if (gzFiles.length && stripGz) {
    console.log('  .gz handling   : removed after the checks below pass, never on --dry-run');
  }
  console.log(`  oversized      : ${oversized.length}`);
  console.log(`  sensitive      : ${sensitive.length}`);

  if (gzFiles.length && !stripGz) {
    console.log('  note           : build with EARTH_GZIP=0 to omit .gz, or pass --strip-gz');
  }
  if (upload.length > FILE_LIMIT) {
    fail(`dist/ would upload ${upload.length} files, above the ${FILE_LIMIT} free-tier limit.`);
  }
  if (oversized.length) {
    fail(`${oversized.length} file(s) exceed 25 MiB: ${oversized.slice(0, 3).map((f) => relative(DIST, f.path)).join(', ')}`);
  }
  if (sensitive.length) {
    fail(`sensitive/working files found: ${sensitive.slice(0, 5).map((f) => relative(DIST, f.path)).join(', ')}`);
  }
  console.log('  result         : OK\n');

  return { toStrip: stripGz ? gzFiles : [] };
}

/** Runs only when every check passed, so a failed deploy cannot eat dist/. */
function stripGzFiles(targets) {
  let removed = 0;
  let freed = 0;
  for (const f of targets) {
    try {
      unlinkSync(f.path);
      freed += f.size;
      removed += 1;
    } catch (err) {
      // Another process may already have removed it; that is fine.
      if (err.code !== 'ENOENT') throw err;
    }
  }
  if (removed) console.log(`[deploy] removed ${removed} .gz file(s), ${prettyBytes(freed)} freed`);
}

function deploy() {
  // Pinned to the v4 major on purpose: bare `npx --yes wrangler` resolves to
  // whatever npm currently tags as latest, so an unrelated major release could
  // change upload behaviour in the middle of a deploy. Bump this line by hand.
  const args = [
    '--yes', 'wrangler@4', 'pages', 'deploy', 'dist',
    '--project-name', project,
    '--branch', branch,
  ];
  console.log('[deploy] npx ' + args.join(' '));
  const result = spawnSync('npx', args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) {
    console.error('\n[deploy] Wrangler failed. If this is an auth error, run:');
    console.error('  npx wrangler login');
    console.error('or put CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in .dev.vars.');
    console.error('First deploy? Wrangler 4 does not create Pages projects automatically:');
    console.error('  npx wrangler pages project create ' + project + ' --production-branch ' + branch + '\n');
    process.exit(result.status || 1);
  }
  console.log('\n[deploy] Done. Check the deployment URL printed above.\n');
}

loadDevVars();
const plan = preflight();

if (dryRun) {
  console.log('[deploy] --dry-run: nothing was removed, nothing was uploaded.\n');
  process.exit(0);
}

stripGzFiles(plan.toStrip);
deploy();
