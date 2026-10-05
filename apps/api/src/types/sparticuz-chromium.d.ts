declare module '@sparticuz/chromium' {
  const chromium: {
    readonly args: string[]
    executablePath(input?: string): Promise<string>
  }
  export default chromium
}
