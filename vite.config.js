import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import compression from 'vite-plugin-compression';
import { resolve } from 'path';
import { readdirSync, unlinkSync } from 'fs';

/**
 * Guard rail for the build: some files live under `public/` purely as local
 * working material and must never reach the server.
 *
 *   - the raw 182 MB Cliopatria dump used to regenerate the century slices
 *   - `*.backup_*` / `*_backup.*` snapshots taken by the data repair scripts
 *
 * They are gitignored already, but that does not stop Vite copying them into
 * `dist/`, which is what actually gets uploaded.
 */
function stripNonShippable() {
  const BLOCKED = [/cliopatria_polities_only/, /\.backup_/, /_backup\./];
  return {
    name: 'strip-non-shippable',
    apply: 'build',
    closeBundle() {
      const rm = (dir) => {
        try {
          for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = resolve(dir, entry.name);
            if (entry.isDirectory()) rm(full);
            else if (BLOCKED.some((pattern) => pattern.test(entry.name))) {
              try {
                unlinkSync(full);
                console.log('[vite] removed', full.replace(/\\/g, '/'));
              } catch {
                /* ignore */
              }
            }
          }
        } catch {
          /* ignore */
        }
      };
      rm('dist');
    },
  };
}

export default defineConfig({
  plugins: [
    vue(),
    viteStaticCopy({
      targets: [
        { src: 'node_modules/cesium/Build/Cesium/Workers/*', dest: 'cesium/Workers' },
        { src: 'node_modules/cesium/Build/Cesium/ThirdParty/*', dest: 'cesium/ThirdParty' },
        { src: 'node_modules/cesium/Build/Cesium/Assets/*', dest: 'cesium/Assets' },
        { src: 'node_modules/cesium/Build/Cesium/Widgets/*', dest: 'cesium/Widgets' },
      ],
    }),
    stripNonShippable(),
    compression({
      algorithm: 'gzip',
      ext: '.gz',
      threshold: 10240,
      deleteOriginFile: false,
      filter: /\.(json|js|css|html)$/,
    }),
  ],
  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesium/'),
  },
  resolve: {
    alias: {
      '@': resolve('src'),
    },
  },
  server: {
    port: 3000,
    strictPort: false,
    open: false,
    /*
     * `public/` holds the dataset: 5,226 year files plus the century slices.
     * Watching them recursively saturates the fs thread pool on Windows —
     * the server accepts connections and then never answers, which looks like
     * "localhost refused / loading forever" rather than like a watcher problem.
     * None of it is HMR-able anyway (data changes need a reload, not a patch),
     * so keep the watcher on src/ only.
     */
    watch: {
      ignored: [
        '**/public/events/**',
        '**/public/ne/**',
        '**/public/_review/**',
        '**/public/cesium/**',
        '**/.playwright-cli/**',
        '**/.tmp*/**',
      ],
    },
  },
  build: {
    chunkSizeWarningLimit: 4096,
  },
});
