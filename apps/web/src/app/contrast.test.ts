import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8')
const hsl = (name: string) => {
  const m = css.match(new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`))
  if (!m) throw new Error(`missing --${name}`)
  return [Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100] as const
}
const rgb = ([h, s, l]: readonly [number, number, number]) => {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  return [0, 8, 4].map((n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))
}
const lum = (c: number[]) => {
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(rgb(hsl(a))), lum(rgb(hsl(b)))].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

describe('foundation contrast', () => {
  it.each([
    ['muted-foreground', 'background'],
    ['muted-foreground', 'card'],
    ['muted-foreground', 'muted'],
    ['success', 'success-subtle'],
    ['foreground', 'background'],
  ])('%s on %s meets AA', (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5)
  })
})
