// npm run build        -> dist/: the folder build, for shipping (itch.io, a website)
// npm run build:single -> dist-single/index.html: one file with everything
//                         inlined, which every check opens from disk
// Vitest reads the test block; Playwright has its own config.
import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => ({
  // Relative paths, so the build works from any folder, itch.io included.
  base: './',
  // Assets are imported in the code (new URL('../assets/x.png', import.meta.url)),
  // so Vite hashes them and the single file inlines them. A public folder would
  // not be inlined, so there is none.
  publicDir: false,
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  // The game's page only: other pages in the project (one-shots in prototypes/)
  // are not scanned for packages.
  optimizeDeps: { entries: ['index.html', 'controller.html'] },
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    emptyOutDir: true,
    // The folder build ships the phone controller page beside the game, as the
    // one-shot did; the single file is the game page alone, for the checks.
    rollupOptions: mode === 'single' ? undefined : {
      input: { main: 'index.html', controller: 'controller.html' },
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
}));
