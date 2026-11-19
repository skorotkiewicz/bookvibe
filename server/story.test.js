import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateStory } from './story.js'

const context = {
  title: 'A test manuscript',
  chapterId: 'return',
  chapters: [
    { id: 'first', title: 'Arrival', text: 'The letter was stamped in blue wax.' },
    { id: 'return', title: 'Return', text: 'Mara opened the window.' },
  ],
  messages: [
    { role: 'user', content: 'Her aunt left town in 1974.' },
    { role: 'assistant', content: 'Did she ever come back?' },
    { role: 'user', content: 'She came back in October.' },
  ],
}

for (const [kind, model, output] of [
  ['chat', 'conversation-model', 'What brought her home?'],
  ['draft', 'prose-model', 'In October, her aunt returned.'],
]) {
  test(`${kind} uses the chosen endpoint and receives the whole story`, async () => {
    const baseURL = `https://${kind}.example.test/v1`
    const response = await generateStory({ kind, config: { baseURL, model, apiKey: `${kind}-key` }, ...context }, {
      fetch: async (url, options) => {
        assert.equal(url, `${baseURL}/chat/completions`)
        assert.equal(new Headers(options.headers).get('authorization'), `Bearer ${kind}-key`)
        const body = JSON.parse(options.body)
        assert.equal(body.model, model)
        const prompt = JSON.stringify(body.messages)
        for (const text of ['blue wax', 'Mara opened the window', '1974', 'Did she ever come back?', 'She came back in October.']) {
          assert.ok(prompt.includes(text), `missing ${text}`)
        }
        return Response.json({
          id: 'test', object: 'chat.completion', created: 1, model,
          choices: [{ index: 0, message: { role: 'assistant', content: output }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 },
        })
      },
    })
    assert.equal(response, output)
  })
}

test('rejects unsupported provider URL schemes before fetching', async () => {
  await assert.rejects(generateStory({ kind: 'chat', ...context, config: { baseURL: 'file:///tmp', model: 'example' } }), /HTTP or HTTPS/)
})

test('rejects a passage cut short by the provider output limit', async () => {
  await assert.rejects(
    generateStory({ kind: 'draft', ...context, config: { baseURL: 'https://draft.example.test/v1', model: 'prose-model' } }, {
      fetch: async () => Response.json({
        id: 'truncated', object: 'chat.completion', created: 1, model: 'prose-model',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Before Mara could finish the' }, finish_reason: 'length' }],
        usage: { prompt_tokens: 20, completion_tokens: 6, total_tokens: 26 },
      }),
    }),
    /cut off/i,
  )
})

test('uses the official OpenAI request fields for its reasoning models', async () => {
  await generateStory({ kind: 'chat', ...context, config: { baseURL: 'https://api.openai.com/v1', model: 'o3' } }, {
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body)
      assert.ok(body.max_completion_tokens > 0)
      assert.equal(body.max_tokens, undefined)
      assert.equal(body.messages[0].role, 'developer')
      return Response.json({
        id: 'test', object: 'chat.completion', created: 1, model: 'o3',
        choices: [{ index: 0, message: { role: 'assistant', content: 'When did they meet?' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 },
      })
    },
  })
})
