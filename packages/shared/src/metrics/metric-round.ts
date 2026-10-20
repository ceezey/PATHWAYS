/** Round half away from zero to 1 decimal place and format as a plain decimal string. */
export function round1(value: number): string {
  const rounded = ((Math.sign(value) || 1) * Math.round(Math.abs(value) * 10)) / 10
  const fixed = rounded.toFixed(1).replace(/\.0$/, '')
  return fixed === '-0' ? '0' : fixed
}
