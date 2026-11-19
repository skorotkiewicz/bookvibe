import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { bookvibeApi } from './api.js'

const pythonAvailable = spawnSync('python3', ['--version']).status === 0

function requestSpeech(input, { origin = 'http://localhost:5173' } = {}) {
  const routes = new Map()
  bookvibeApi().configureServer({ middlewares: { use: (path, handler) => routes.set(path, handler) } })
  const handler = routes.get('/api/speech')
  assert.ok(handler, 'Speech Dispatcher fallback route is registered')
  const request = Object.assign(Readable.from([Buffer.from(JSON.stringify(input))]), {
    method: 'POST',
    headers: { host: 'localhost:5173', origin, 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
  })
  const response = Object.assign(new EventEmitter(), {
    setHeader() {},
    end(body) { this.body = JSON.parse(body) },
  })
  return { response, finished: handler(request, response) }
}

test('lists system voices, uses the selected voice and cancels only its own speech', { skip: !pythonAvailable }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'bookvibe-speech-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const logPath = join(directory, 'speech.log')
  const originalPythonPath = process.env.PYTHONPATH
  const originalSpeechLog = process.env.BOOKVIBE_TEST_SPEECH_LOG
  process.env.PYTHONPATH = directory
  process.env.BOOKVIBE_TEST_SPEECH_LOG = logPath
  t.after(() => {
    if (originalPythonPath === undefined) delete process.env.PYTHONPATH
    else process.env.PYTHONPATH = originalPythonPath
    if (originalSpeechLog === undefined) delete process.env.BOOKVIBE_TEST_SPEECH_LOG
    else process.env.BOOKVIBE_TEST_SPEECH_LOG = originalSpeechLog
  })

  await writeFile(join(directory, 'speechd.py'), `
import json
import os

def record(*parts):
    with open(os.environ["BOOKVIBE_TEST_SPEECH_LOG"], "a") as out:
        out.write(json.dumps(parts) + "\\n")

class CallbackType:
    END = "end"
    CANCEL = "cancel"

class SSIPClient:
    def __init__(self, name):
        pass
    def list_synthesis_voices(self):
        return [("Test voice", "en", None)]
    def set_language(self, language):
        record("language", language)
    def set_synthesis_voice(self, name):
        record("voice", name)
    def speak(self, text, callback=None, event_types=None):
        record("speak", text)
        if text != "Wait for cancellation.":
            callback(CallbackType.END)
    def cancel(self):
        record("cancel-self")
    def close(self):
        pass
`)

  const voices = requestSpeech({ action: 'voices' })
  await voices.finished
  assert.equal(voices.response.statusCode, 200)
  assert.deepEqual(voices.response.body.voices, [{ name: 'Test voice', lang: 'en' }])

  const play = requestSpeech({ action: 'speak', text: 'First paragraph.\n\nSecond paragraph.', voice: { name: 'Test voice', lang: 'en' } })
  await play.finished
  assert.equal(play.response.statusCode, 200)
  const records = async () => (await readFile(logPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
  assert.deepEqual(await records(), [
    ['language', 'en'], ['voice', 'Test voice'], ['speak', 'First paragraph.'], ['speak', 'Second paragraph.'],
  ])

  const waiting = requestSpeech({ action: 'speak', text: 'Wait for cancellation.' })
  for (let i = 0; i < 200; i++) {
    if ((await records()).at(-1)?.[1] === 'Wait for cancellation.') break
    await delay(10)
  }
  assert.deepEqual((await records()).at(-1), ['speak', 'Wait for cancellation.'])
  waiting.response.destroyed = true
  waiting.response.emit('close')
  await waiting.finished
  for (let i = 0; i < 200; i++) {
    if ((await records()).at(-1)?.[0] === 'cancel-self') break
    await delay(10)
  }
  assert.deepEqual((await records()).at(-1), ['cancel-self'])
})

test('rejects cross-origin playback before reaching the system voice', async () => {
  const attempt = requestSpeech({ action: 'speak', text: 'Read this aloud.' }, { origin: 'https://example.test' })
  await attempt.finished
  assert.equal(attempt.response.statusCode, 403)
})
