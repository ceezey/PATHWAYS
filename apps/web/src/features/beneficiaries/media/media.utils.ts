export const formatMediaFileSize = (bytes: number) => {
  if (bytes < 1_000_000) {
    return `${Math.max(1, Math.round(bytes / 1_000))} KB`
  }

  return `${(bytes / 1_000_000).toFixed(1)} MB`
}
