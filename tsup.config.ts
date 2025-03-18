import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: true,
  outDir: 'dist',
  outExtension({ format }) {
    return {
      js: format === 'cjs' ? '.js' : '.mjs'
    };
  },
  esbuildOptions(options) {
    options.conditions = ['browser', 'import', 'require'];
  }
});