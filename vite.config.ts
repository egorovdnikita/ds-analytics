import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/** UI собирается в один самодостаточный HTML — Figma iframe не грузит внешние ассеты. */
export default defineConfig({
  root: 'src/ui',
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: '../../dist',
    emptyOutDir: false,
    target: 'es2017',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    reportCompressedSize: false,
  },
});
