import { defineConfig } from 'vite';

// Static single-page app. Root is the project dir; assets in /public are served at /.
export default defineConfig({
  root: '.',
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
