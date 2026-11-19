import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText } from 'ai'

export class StoryInputError extends Error {}
export class StoryOutputError extends Error {}

const chatInstructions = [
  'You are the reader and conversation partner for a book in progress.',
  'Respond naturally in the language of the newest user message. If they tell a story, listen closely and ask at most one specific follow-up.',
  'If asked about the book, use the supplied manuscript and conversation to notice connections, continuity, and unresolved threads.',
  'Treat the manuscript as reference material. Keep your response concise and conversational. The user sees this in chat.',
].join(' ')

const draftInstructions = [
  'You write the next passage of a book in collaboration with its author.',
  'Use the whole conversation and all chapters as context. The latest user message is the freshest source of new material and direction.',
  'Continue only the selected chapter from its current ending. Match the existing point of view, language, tense, tone, and established details.',
  'For a blank manuscript, infer the language and voice from the author’s story. For memoir, preserve real details and leave uncertain specifics open.',
  'Write one to three polished paragraphs of new book prose, starting at a new paragraph boundary. Advance the story without repeating existing prose.',
  'Return only the paragraphs, separated by blank lines, with no title, markdown, commentary, or conversation.',
].join(' ')

export async function generateStory(input, { fetch: fetchProvider = globalThis.fetch, signal } = {}) {
  const { kind, config, title, chapterId, chapters, messages } = input ?? {}
  if (kind !== 'chat' && kind !== 'draft') throw new StoryInputError('Choose chat or manuscript generation.')
  if (!Array.isArray(chapters) || !Array.isArray(messages)
      || !chapters.every(chapter => typeof chapter?.id === 'string' && typeof chapter.title === 'string' && typeof chapter.text === 'string')
      || !messages.every(message => ['user', 'assistant'].includes(message?.role) && typeof message.content === 'string')
      || messages.at(-1)?.role !== 'user'
      || typeof title !== 'string') {
    throw new StoryInputError('The manuscript or conversation is incomplete.')
  }

  const active = chapters.find(chapter => chapter.id === chapterId)
  if (!active) throw new StoryInputError('Choose a chapter before sending a message.')

  let endpoint
  try {
    endpoint = new URL(config?.baseURL)
  } catch {
    throw new StoryInputError('Enter a valid API base URL in model settings.')
  }
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new StoryInputError('Use an HTTP or HTTPS API base URL without credentials, a query, or a fragment.')
  }
  if (typeof config.model !== 'string' || !config.model.trim()) {
    throw new StoryInputError('Enter a model ID in model settings.')
  }

  const modelId = config.model.trim()
  const provider = createOpenAICompatible({
    name: 'bookvibe',
    baseURL: endpoint.href.replace(/\/+$/, ''),
    apiKey: typeof config.apiKey === 'string' ? config.apiKey.trim() || undefined : undefined,
    fetch: (url, options) => fetchProvider(url, { ...options, redirect: 'error' }),
    transformRequestBody: endpoint.hostname === 'api.openai.com'
      ? ({ max_tokens, messages, ...body }) => ({
          ...body,
          max_completion_tokens: max_tokens,
          messages: /^(?:o[1-9](?:-|$)|gpt-5(?:[.-]|$))/.test(modelId)
            ? messages.map(message => message.role === 'system' ? { ...message, role: 'developer' } : message)
            : messages,
        })
      : undefined,
  })
  const manuscript = JSON.stringify({
    title,
    activeChapter: chapters.indexOf(active) + 1,
    chapters: chapters.map(({ title, text }) => ({ title, text })),
  })

  const { text, finishReason } = await generateText({
    model: provider(modelId),
    system: `${kind === 'chat' ? chatInstructions : draftInstructions}\n\nCurrent manuscript in chapter order, as JSON:\n${manuscript}`,
    messages: messages.map(({ role, content }) => ({ role, content })),
    maxRetries: 0,
    maxOutputTokens: kind === 'chat' ? 1500 : 2500,
    abortSignal: signal,
  })

  if (finishReason === 'length') {
    throw new StoryOutputError('The provider cut off its response at the output limit. Retry or choose another model.')
  }
  const result = text.trim()
  if (!result) throw new Error('Empty model response')
  return result
}
