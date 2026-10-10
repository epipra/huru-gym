// Renders brand/huru/icon.svg to the PNG sizes the web app and the native shells use.
// Run from frontend/ (where sharp is installed):  node ../brand/huru/make-icons.mjs
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// sharp comes with frontend's dev dependencies (@capacitor/assets); resolve it from there.
const sharp = createRequire(join(process.cwd(), 'package.json'))('sharp')

const dir = dirname(fileURLToPath(import.meta.url))
const svg = join(dir, 'icon.svg')
for (const size of [180, 192, 512, 1024]) {
  await sharp(svg, { density: 300 }).resize(size, size).png().toFile(join(dir, 'icons', `icon-${size}.png`))
  console.log(`icon-${size}.png`)
}
