import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import tinkerSrc from 'tinker-companion/vite-plugin';
import { defineConfig } from 'vite';

// TINKER_SRC=1 runs a second dev server (port 5175) with the companion's source-attribute
// plugin, so both the plain React 19 path and the plugin path can be tested.
const withSource = process.env.TINKER_SRC === '1';

export default defineConfig({
  plugins: [withSource && tinkerSrc(), react(), tailwindcss()],
  server: { port: withSource ? 5175 : 5173, strictPort: true },
  ...(withSource ? { cacheDir: 'node_modules/.vite-tinker-src' } : {}),
  css: {
    modules: {
      // CRA/Next-style names (UserCard_title__x7Ab2), the pattern SPEC.md describes.
      generateScopedName(local, filename) {
        const file = basename(filename.split('?')[0] ?? filename).replace(/\.module\.\w+$/, '');
        const hash = createHash('sha256').update(`${file}:${local}`).digest('base64url').slice(0, 5);
        return `${file}_${local}__${hash}`;
      },
    },
  },
});
