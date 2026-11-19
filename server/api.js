import { generateStory, StoryInputError, StoryOutputError } from './story.js'

const LOCAL_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i
const LOCAL_ADDRESS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

export function bookvibeApi() {
  const mount = server => {
    server.middlewares.use('/api/story', handleStory)
  }
  return { name: 'bookvibe-api', configureServer: mount, configurePreviewServer: mount }
}

async function handleStory(request, response) {
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
    return send(403, { error: 'Open Bookvibe on localhost to use model connections.' })
  }
  if (request.method !== 'POST' || contentType?.split(';')[0].toLowerCase() !== 'application/json') {
    return send(405, { error: 'Send a JSON POST request.' })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120_000)
  response.once('close', () => controller.abort())
  try {
    const chunks = []
    let size = 0
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      size += chunk.length
      if (size > 8 * 1024 * 1024) {
        request.resume()
        return send(413, { error: 'This book and conversation exceed the request size limit.' })
      }
      chunks.push(chunk)
    }
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    const text = await generateStory(input, { signal: controller.signal })
    return send(200, { text })
  } catch (error) {
    if (error instanceof SyntaxError) return send(400, { error: 'Send valid JSON.' })
    if (error instanceof StoryInputError) return send(400, { error: error.message })
    if (error instanceof StoryOutputError) return send(502, { error: error.message })
    if (controller.signal.aborted) return send(504, { error: 'The model took too long to respond. Try again.' })
    const detail = `${error.message ?? ''} ${error.responseBody ?? ''}`
    if (/context.length|context.window|too many tokens|maximum context/i.test(detail)) {
      return send(422, { error: 'This book and conversation exceed the model’s context window. Choose a model with a larger context window and retry.' })
    }
    if ([401, 403].includes(error.statusCode)) {
      return send(502, { error: 'The provider rejected the credentials. Check the API key in model settings.' })
    }
    if (error.statusCode === 429) {
      return send(502, { error: 'The provider is limiting requests. Try again shortly.' })
    }
    const status = error.statusCode ? ` (${error.statusCode})` : ''
    return send(502, { error: `The model did not return usable text${status}. Check your API URL and model ID, then retry.` })
  } finally {
    clearTimeout(timeout)
  }
}
