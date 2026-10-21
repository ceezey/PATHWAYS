import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// maplibre-gl 6 builds its worker URL at runtime, so bundlers never emit it; serve the installed copy from public.
const dist = path.dirname(
  createRequire(import.meta.url).resolve('maplibre-gl/dist/maplibre-gl.css'),
)
const target = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/maplibre')
mkdirSync(target, { recursive: true })
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'])
  copyFileSync(path.join(dist, file), path.join(target, file))
