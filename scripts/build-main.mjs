import { build, context } from 'esbuild';

/** Figma sandbox: один IIFE-файл, без внешних импортов и без DOM. */
const options = {
  entryPoints: ['src/main/index.ts'],
  outfile: 'dist/code.js',
  bundle: true,
  format: 'iife',
  target: 'es2017',
  platform: 'neutral',
  logLevel: 'info',
  minify: !process.argv.includes('--watch'),
};

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('watching src/main …');
} else {
  await build(options);
}
