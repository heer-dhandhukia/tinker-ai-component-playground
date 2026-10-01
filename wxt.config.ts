import { defineConfig } from 'wxt';
import { buildManifest } from './src/shared/manifest';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: ({ mode }) => buildManifest(mode),
});
