import { generateStory, StoryInputError, StoryOutputError } from './story.js'
import { systemSpeech } from './speech.js'

const LOCAL_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i
const LOCAL_ADDRESS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function bookvibeApi() {
  const mount = server => {
    server.middlewares.use('/api/story', localJson(handleStory, 120_000))
    server.middlewares.use('/api/speech', localJson(handleSpeech))
  }
  return { name: 'bookvibe-api', configureServer: mount, configurePreviewServer: mount }
}

function localJson(handle, timeoutMs) {
  return async (request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')

    function send(status, payload) {
      if (response.destroyed) return
      response.statusCode = status
      response.end(JSON.stringify(payload))
    }

    const { host, origin, 'content-type': contentType } = request.headers
    if (!LOCAL_ADDRESS.has(request.socket.remoteAddress) || !LOCAL_HOST.test(host ?? '')
        || (origin && origin !== `http://${host}` && origin !== `https://${host}`)) {
      return send(403, { error: 'Open Bookvibe on localhost to use its local services.' })
    }
    if (request.method !== 'POST' || contentType?.split(';')[0].toLowerCase() !== 'application/json') {
      return send(405, { error: 'Send a JSON POST request.' })
    }

    const controller = new AbortController()
    const timeout = timeoutMs && setTimeout(() => controller.abort(), timeoutMs)
    response.once('close', () => controller.abort())
    try {
      const chunks = []
      let size = 0
      for await (const chunk of request.iterator({ destroyOnReturn: false })) {
        size += chunk.length
        if (size > 8 * 1024 * 1024) {
          request.resume()
          return send(413, { error: 'The request exceeds the size limit.' })
        }
        chunks.push(chunk)
      }
      let input
      try {
        input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        return send(400, { error: 'Send valid JSON.' })
      }
      return send(200, await handle(input, controller.signal))
    } catch (error) {
      if (error instanceof ApiError) return send(error.status, { error: error.message })
      return send(500, { error: 'The local service could not complete the request.' })
    } finally {
      clearTimeout(timeout)
    }
  }
}

async function handleStory(input, signal) {
  try {
    return { text: await generateStory(input, { signal }) }
  } catch (error) {
    if (error instanceof StoryInputError) throw new ApiError(400, error.message)
    if (error instanceof StoryOutputError) throw new ApiError(502, error.message)
    if (signal.aborted) throw new ApiError(504, 'The model took too long to respond. Try again.')
    const detail = `${error.message ?? ''} ${error.responseBody ?? ''}`
    if (/context.length|context.window|too many tokens|maximum context/i.test(detail)) {
      throw new ApiError(422, 'This book and conversation exceed the model’s context window. Choose a model with a larger context window and retry.')
    }
    if ([401, 403].includes(error.statusCode)) {
      throw new ApiError(502, 'The provider rejected the credentials. Check the API key in model settings.')
    }
    if (error.statusCode === 429) {
      throw new ApiError(502, 'The provider is limiting requests. Try again shortly.')
    }
    const status = error.statusCode ? ` (${error.statusCode})` : ''
    throw new ApiError(502, `The model did not return usable text${status}. Check your API URL and model ID, then retry.`)
  }
}

async function handleSpeech(input, signal) {
  const { action, text, voice } = input ?? {}
  if (action !== 'voices' && (action !== 'speak' || typeof text !== 'string' || !text.trim())) {
    throw new ApiError(400, 'Send chapter text to read aloud.')
  }
  if (voice != null && (
    ![voice.name, voice.lang].every(value => typeof value === 'string' && value.length <= 512 && !/[\u0000-\u001f\u007f]/.test(value))
    || !voice.name.trim()
  )) {
    throw new ApiError(400, 'Choose a valid system voice.')
  }

  try {
    return await systemSpeech(action === 'voices' ? { action } : { action, text, voice }, signal)
  } catch {
    throw new ApiError(503, 'Speech Dispatcher is unavailable. Check that the system service and its Python bindings are installed.')
  }
}
