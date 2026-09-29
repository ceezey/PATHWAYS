import { readRulesDispatcherEnv } from '@pathways/config'
import { dispatchRulesOnce, runRulesDispatcher } from './modules/rules/rules-dispatch-client'

async function main() {
  const [mode, ...extra] = process.argv.slice(2)
  if (!['drain', 'sweep', 'serve'].includes(mode) || extra.length)
    throw new Error('Invalid dispatcher mode.')
  const options = readRulesDispatcherEnv(process.env)
  const shutdown = new AbortController()
  const stop = () => shutdown.abort()
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  try {
    if (mode === 'serve') await runRulesDispatcher(options, shutdown.signal)
    else {
      await dispatchRulesOnce(options, mode === 'drain' ? 'DRAIN' : 'SWEEP', shutdown.signal)
      console.info('Rules dispatch acknowledged.')
    }
  } finally {
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
  }
}
void main().catch(() => {
  console.error('Rules dispatch is temporarily unavailable.')
  process.exitCode = 1
})
