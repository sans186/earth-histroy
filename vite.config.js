import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import compression from 'vite-plugin-compression';
import { resolve } from 'path';
import { readdirSync, statSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';

function stripRawCliopatria() {
  const patterns = ['cliopatria_polities_only.json', 'cliopatria_polities_only.json.gz'];
  return {
    name: 'strip-raw-cliopatria',
    apply: 'build',
    closeBundle() {
      function rmRecursive(dir) {
        try {
          const entries = readdirSync(dir, { withFileTypes: true });
          for (const e of entries) {
            const full = resolve(dir, e.name);
            if (e.isDirectory()) rmRecursive(full);
            else if (patterns.some((p) => e.name.includes(p.replace('.gz', '')))) {
              try { unlinkSync(full); console.log('[vite] removed', full.replace(/\\/g, '/')); } catch {}
            }
          }
        } catch {}
      }
      rmRecursive('dist');
    },
  };
}

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/cesium/Build/Cesium/Workers/*',
          dest: 'cesium/Workers',
        },
        {
          src: 'node_modules/cesium/Build/Cesium/ThirdParty/*',
          dest: 'cesium/ThirdParty',
        },
        {
          src: 'node_modules/cesium/Build/Cesium/Assets/*',
          dest: 'cesium/Assets',
        },
        {
          src: 'node_modules/cesium/Build/Cesium/Widgets/*',
          dest: 'cesium/Widgets',
        },
      ],
    }),
    stripRawCliopatria(),
    // gzip-compress JSON, JS, CSS, HTML in production build
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
    open: true,
  },
});
