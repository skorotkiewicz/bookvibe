import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const script = fileURLToPath(new URL('./speech.py', import.meta.url))

export async function systemSpeech(input, signal) {
  signal.throwIfAborted()
  const result = run('python3', ['-B', script], {
    signal,
    timeout: input.action === 'voices' ? 5000 : 2 * 60 * 60 * 1000,
    maxBuffer: 4 * 1024 * 1024,
  })
  // A missing or unavailable system speech service can close stdin early.
  result.child.stdin.on('error', () => {})
  result.child.stdin.end(JSON.stringify(input))

  return JSON.parse((await result).stdout)
}
