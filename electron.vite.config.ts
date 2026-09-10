import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    // @kubernetes/client-node ships ESM-only. It's kept external (see below) and loaded via a
    // real dynamic import() at runtime instead of require() -- so keep genuine import()
    // expressions in the CJS output rather than letting Rollup downgrade them to require().
    build: {
      rollupOptions: {
        output: { dynamicImportInCjs: false }
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
