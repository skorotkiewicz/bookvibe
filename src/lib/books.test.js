import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadBooks, loadSettings, saveBooks, saveSettings } from './books.js'

function storage() {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  }
}

test('a tab never reuses its key for a different API URL saved by another tab', () => {
  const sharedStorage = storage()
  const firstTab = storage()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: sharedStorage })
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: firstTab })

  const settings = loadSettings()
  settings.chat = { baseURL: 'https://first.example.test/v1', model: 'chat', apiKey: 'first-tab-key' }
  saveSettings(settings)
  assert.equal(loadSettings().chat.apiKey, 'first-tab-key')

  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage() })
  settings.chat = { baseURL: 'https://second.example.test/v1', model: 'other', apiKey: 'second-tab-key' }
  saveSettings(settings)

  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: firstTab })
  const reloaded = loadSettings()
  assert.equal(reloaded.chat.baseURL, 'https://second.example.test/v1')
  assert.equal(reloaded.chat.apiKey, '')
})

test('an older workspace cannot overwrite a newer saved draft', () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage() })

  const firstTab = loadBooks()
  const secondTab = loadBooks()
  firstTab.data.books[0].chapters[0].text = 'A newer saved draft.'
  assert.ok(saveBooks(JSON.stringify(firstTab.data), firstTab.stored))
  secondTab.data.books[0].chapters[0].text = 'An older draft.'
  assert.equal(saveBooks(JSON.stringify(secondTab.data), secondTab.stored), null)
  assert.equal(loadBooks().data.books[0].chapters[0].text, 'A newer saved draft.')
})
