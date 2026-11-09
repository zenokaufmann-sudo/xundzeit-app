// Erzeugt die App-Icons einmalig aus SVG. Aufruf: npm run icons
import { mkdirSync } from 'node:fs'
import { webkit } from '@playwright/test'

const svg = (rand) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <rect width="512" height="512" fill="#2f5d62"/>
  <g transform="translate(256 262) scale(${rand}) translate(-100 -128)">
    <defs><clipPath id="k"><path d="M100 6C150 6 182 44 182 102C182 130 178 150 170 172C160 206 130 250 100 250C70 250 40 206 30 172C22 150 18 130 18 102C18 44 50 6 100 6Z"/></clipPath></defs>
    <path d="M100 6C150 6 182 44 182 102C182 130 178 150 170 172C160 206 130 250 100 250C70 250 40 206 30 172C22 150 18 130 18 102C18 44 50 6 100 6Z" fill="#f4f2ec"/>
    <path clip-path="url(#k)" d="M148 101Q174 104 200 112V158Q174 156 148 155Z" fill="#c6723a"/>
    <path clip-path="url(#k)" d="M120 50Q160 52 200 62V112Q166 102 130 99Z" fill="#c9a24b"/>
  </g>
</svg>`

const ZIELE = [
  ['apple-touch-icon.png', 180, 1.5],
  ['icon-192.png', 192, 1.5],
  ['icon-512.png', 512, 1.5],
  ['icon-maskable-512.png', 512, 1.15],
]

mkdirSync('public/icons', { recursive: true })
const browser = await webkit.launch()
for (const [name, groesse, rand] of ZIELE) {
  const page = await browser.newPage({ viewport: { width: groesse, height: groesse } })
  await page.setContent(`<!doctype html><style>html,body{margin:0;height:100%}svg{display:block}</style>${svg(rand)}`)
  await page.screenshot({ path: `public/icons/${name}` })
  await page.close()
}
await browser.close()
