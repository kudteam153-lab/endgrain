import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Относительный base: сборка не знает, по какому пути её положат. Площадка
  // ещё не выбрана (CORE_PRINCIPLES §7), а с '/' сборка ломается на любом
  // хостинге с подкаталогом — GitHub Pages именно такой.
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
