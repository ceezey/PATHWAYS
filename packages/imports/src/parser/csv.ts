import Papa, { type ParseError } from 'papaparse'

export interface CsvParseResult<T = Record<string, string>> {
  data: T[]
  errors: string[]
  headers: string[]
}

export const parseCsv = <T = Record<string, string>>(input: string): CsvParseResult<T> => {
  const result = Papa.parse<T>(input, {
    header: true,
    skipEmptyLines: true,
  })

  return {
    data: result.data,
    errors: result.errors.map((error: ParseError) => error.message),
    headers: result.meta.fields ?? [],
  }
}
