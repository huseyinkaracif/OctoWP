// Generate build/icon.png (256x256) and build/icon.ico — no native/image deps.
// A WhatsApp-green rounded square with a white chat bubble + three dots.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIZE = 256
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'build')
mkdirSync(outDir, { recursive: true })

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const lerp = (a, b, t) => a + (b - a) * t
const top = hex('#25d366')
const bot = hex('#0f8a6e')
const teal = hex('#0b6b5e')

function sdRound(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - hw + r
  const qy = Math.abs(y - cy) - hh + r
  const ax = Math.max(qx, 0)
  const ay = Math.max(qy, 0)
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(ax, ay) - r
}
const cov = (sd) => Math.max(0, Math.min(1, 0.5 - sd))

const px = new Uint8Array(SIZE * SIZE * 4)
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4
    const fx = x + 0.5
    const fy = y + 0.5
    const a = cov(sdRound(fx, fy, 128, 128, 116, 116, 52))
    const t = y / SIZE
    let r = lerp(top[0], bot[0], t)
    let g = lerp(top[1], bot[1], t)
    let b = lerp(top[2], bot[2], t)
    const bubble = cov(sdRound(fx, fy, 128, 116, 66, 46, 26))
    const tail = cov(sdRound(fx, fy, 90, 150, 15, 17, 7))
    const white = Math.max(bubble, tail)
    r = lerp(r, 255, white)
    g = lerp(g, 255, white)
    b = lerp(b, 255, white)
    for (const dx of [-30, 0, 30]) {
      const dot = cov(Math.hypot(fx - (128 + dx), fy - 116) - 7)
      r = lerp(r, teal[0], dot)
      g = lerp(g, teal[1], dot)
      b = lerp(b, teal[2], dot)
    }
    px[i] = r
    px[i + 1] = g
    px[i + 2] = b
    px[i + 3] = Math.round(a * 255)
  }
}

// ---- PNG encoder ----
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}
function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  let p = 0
  for (let y = 0; y < height; y++) {
    raw[p++] = 0
    for (let x = 0; x < width * 4; x++) raw[p++] = rgba[y * width * 4 + x]
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const png = encodePng(SIZE, SIZE, px)
writeFileSync(join(outDir, 'icon.png'), png)

// ---- ICO (PNG-embedded, Vista+) ----
const ico = Buffer.alloc(22)
ico.writeUInt16LE(0, 0)
ico.writeUInt16LE(1, 2)
ico.writeUInt16LE(1, 4)
ico[6] = 0 // width 256
ico[7] = 0 // height 256
ico[8] = 0
ico[9] = 0
ico.writeUInt16LE(1, 10)
ico.writeUInt16LE(32, 12)
ico.writeUInt32LE(png.length, 14)
ico.writeUInt32LE(22, 18)
writeFileSync(join(outDir, 'icon.ico'), Buffer.concat([ico, png]))

console.log('[make-icon] wrote build/icon.png and build/icon.ico')
