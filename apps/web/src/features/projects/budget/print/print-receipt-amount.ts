const ones = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
]
const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const scales: Array<[number, string]> = [
  [1_000_000_000, 'billion'],
  [1_000_000, 'million'],
  [1_000, 'thousand'],
]

const belowHundred = (value: number): string =>
  value < 20
    ? ones[value]
    : `${tens[Math.floor(value / 10)]}${value % 10 ? `-${ones[value % 10]}` : ''}`

const whole = (value: number): string => {
  if (value < 100) return belowHundred(value)
  for (const [size, name] of scales)
    if (value >= size)
      return `${whole(Math.floor(value / size))} ${name}${value % size ? ` ${whole(value % size)}` : ''}`
  const rest = value % 100
  return `${ones[Math.floor(value / 100)]} hundred${rest ? ` ${whole(rest)}` : ''}`
}

/** Peso amount written out, as a disbursement record states it beside the figures. */
export const amountInWords = (amount: string) => {
  const parsed = Number(amount)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed >= 1_000_000_000_000) return 'Not available'
  const pesos = Math.floor(parsed)
  const centavos = Math.round((parsed - pesos) * 100)
  const words = `${whole(pesos)} peso${pesos === 1 ? '' : 's'}`
  const withCentavos = centavos
    ? `${words} and ${whole(centavos)} centavo${centavos === 1 ? '' : 's'}`
    : words
  return `${withCentavos.charAt(0).toUpperCase()}${withCentavos.slice(1)} only`
}
