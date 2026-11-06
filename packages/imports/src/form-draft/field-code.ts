const MAX_CODE_LENGTH = 64

/** Builds an ASCII field code from a header, starting with a letter, and adds it to `taken`. */
export function fieldCodeFromHeader(header: string, taken: Set<string>): string {
  const slug = header
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  const base = /^[a-z]/.test(slug) ? slug : `f_${slug}`
  const fit = (suffix: string) =>
    `${base.slice(0, MAX_CODE_LENGTH - suffix.length).replace(/_+$/, '')}${suffix}`
  let code = fit('')
  for (let n = 2; taken.has(code); n++) code = fit(`_${n}`)
  taken.add(code)
  return code
}
