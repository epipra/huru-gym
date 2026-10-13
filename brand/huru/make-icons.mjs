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

// Android sources for @capacitor/assets (brand/huru/android/build.sh runs it): the full icon,
// the adaptive icon's two layers (the mark on transparent, the gradient alone) and the splash.
import { readFileSync, mkdirSync } from 'node:fs'
const src = readFileSync(svg, 'utf8')
const markOnly = src.replace(/<rect width="512" height="512"[^>]*\/>/, '')
const bgOnly = src.replace(/<!-- "H"[\s\S]*<\/svg>/, '</svg>')
const out = join(dir, 'android', 'assets')
mkdirSync(out, { recursive: true })
await sharp(svg, { density: 300 }).resize(1024, 1024).png().toFile(join(out, 'icon-only.png'))
await sharp(Buffer.from(markOnly), { density: 300 }).resize(1024, 1024).png().toFile(join(out, 'icon-foreground.png'))
await sharp(Buffer.from(bgOnly), { density: 300 }).resize(1024, 1024).png().toFile(join(out, 'icon-background.png'))
const mark = await sharp(svg, { density: 300 }).resize(560, 560).png().toBuffer()
for (const name of ['splash.png', 'splash-dark.png']) {
  await sharp({ create: { width: 2732, height: 2732, channels: 4, background: '#0c0e12' } })
    .composite([{ input: mark, gravity: 'center' }]).png().toFile(join(out, name))
}
console.log('android/assets: icon-only, icon-foreground, icon-background, splash, splash-dark')
