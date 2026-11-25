const browsers: Array<[RegExp, string]> = [
  [/Edg\//, 'Edge'],
  [/OPR\//, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
]
const systems: Array<[RegExp, string]> = [
  [/iPhone|iPad/, 'iOS'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'Mac'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
]

const first = (list: Array<[RegExp, string]>, text: string) =>
  list.find(([pattern]) => pattern.test(text))?.[1]

// A short, readable name for a browser's User-Agent text, such as "Chrome on Windows".
export function deviceLabel(device: string | null): string {
  if (!device) return 'Unknown device'
  const browser = first(browsers, device)
  const system = first(systems, device)
  if (browser && system) return `${browser} on ${system}`
  return browser ?? system ?? 'Unknown device'
}
