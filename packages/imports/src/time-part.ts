// An optional trailing time ([T ]HH:MM[:SS][ AM|PM][ zone]) is ignored: the date is kept as written.
export const timePart = String.raw`(?:[T ](?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?: ?[AP]M)?(?: ?(?:Z|(?:GMT|UTC)?[+-]\d{1,2}(?::?\d{2})?|GMT|UTC))?)?`
