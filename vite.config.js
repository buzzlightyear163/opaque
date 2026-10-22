import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`          -> dist/            (deploy this to Vercel / Netlify)
// `npm run build:preview`  -> dist-artifact/   (single-file preview build, local echo mode)
export default defineConfig(({ mode }) => ({
  plugins: mode === 'artifact' ? [viteSingleFile()] : [],
  build: {
    outDir: mode === 'artifact' ? 'dist-artifact' : 'dist',
    target: 'es2020',
    chunkSizeWarningLimit: 900,
  },
}));
