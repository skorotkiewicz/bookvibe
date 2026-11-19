const sample = {
  id: 'sample',
  title: 'The Quiet Between Tides',
  activeChapterId: 'last-light',
  chapters: [
    {
      id: 'last-light',
      title: 'The Last Light',
      text: [
        'The lighthouse went dark on a Thursday. I remember because it was my father’s night to make soup, and even after he left, my mother kept the habit. By six the windows had fogged and a pot of leeks was coming to a boil. Then the beam that swept across our kitchen every eleven seconds failed to come back.',
        'My mother set down her spoon. Out on the headland, the tower was already disappearing into the weather. We waited for the next pass of the light. It had been a fact of my life, as steady as the clock in the hall and much more dependable. I had never seen the kitchen from that side of the dark.',
        'She took his brass key from its nail by the door. As children we would pass it back and forth on cold mornings just to see whose hand could warm it first. That night she closed her fist around it and stood in the kitchen for a long time, still in her apron.',
        '“Leave the soup,” she said. “Get your coat.”',
      ].join('\n\n'),
    },
    {
      id: 'low-water',
      title: 'Low Water',
      text: [
        'By morning, the tide had gone out so far that all the old pilings stood clear of the water. I walked the length of the beach collecting bits of rope. There was nothing to tie them to and nobody waiting for me to come home.',
        'At the bend I found a small green bottle wedged where the rocks met the sand. Inside it was a sheet of paper that had been folded twice, its edges brown with age.',
      ].join('\n\n'),
    },
    { id: 'letters', title: 'Letters from the Shore', text: '' },
  ],
  turns: [
    {
      id: 'sample-turn',
      chapterId: 'last-light',
      content: 'I remember the night the lighthouse went dark. My mother was making soup. She took my father’s old brass key off its hook and told me to get my coat.',
      reply: 'The soup is such a good detail. It makes the blackout feel like an interruption of something ordinary. Did you already know what the brass key opened, or did you only find out that night?',
      count: 53,
      chatState: 'done',
      draftState: 'done',
    },
  ],
}

export function newBook(title) {
  const chapter = { id: crypto.randomUUID(), title: 'Untitled chapter', text: '' }
  return { id: crypto.randomUUID(), title, activeChapterId: chapter.id, chapters: [chapter], turns: [] }
}

export function loadBooks() {
  let stored = null
  try {
    stored = localStorage.getItem('bookvibe.books.v1')
    const saved = JSON.parse(stored)
    if (saved?.books?.length) {
      for (const book of saved.books) {
        for (const turn of book.turns) {
          if (turn.chatState === 'pending') turn.chatState = 'error'
          if (turn.draftState === 'pending') turn.draftState = 'error'
        }
      }
      return { data: saved, stored }
    }
  } catch {
    // Start with the sample if storage is unavailable.
  }
  return { data: { books: [structuredClone(sample)], activeId: sample.id }, stored }
}

export function saveBooks(snapshot, previous) {
  if (localStorage.getItem('bookvibe.books.v1') !== previous) return null
  localStorage.setItem('bookvibe.books.v1', snapshot)
  return snapshot
}

const providerDefaults = { baseURL: 'https://api.openai.com/v1', model: '' }

export function endpointIdentity(value) {
  try {
    return new URL(value).href.replace(/\/+$/, '')
  } catch {
    return value.trim()
  }
}

export function loadSettings() {
  const settings = { shared: true, chat: { ...providerDefaults, apiKey: '' }, draft: { ...providerDefaults, apiKey: '' } }
  try {
    const saved = JSON.parse(localStorage.getItem('bookvibe.models.v1'))
    const keys = JSON.parse(sessionStorage.getItem('bookvibe.keys.v1'))
    settings.shared = saved?.shared ?? settings.shared
    for (const kind of ['chat', 'draft']) {
      Object.assign(settings[kind], saved?.[kind])
      if (keys?.[kind]?.endpoint === endpointIdentity(settings[kind].baseURL)) {
        settings[kind].apiKey = keys[kind].apiKey
      }
    }
  } catch {
    // Model settings can still be used for the current page.
  }
  return settings
}

export function saveSettings(settings) {
  const { apiKey: chatKey, ...chat } = settings.chat
  const { apiKey: draftKey, ...draft } = settings.draft
  localStorage.setItem('bookvibe.models.v1', JSON.stringify({ shared: settings.shared, chat, draft }))
  sessionStorage.setItem('bookvibe.keys.v1', JSON.stringify({
    chat: { endpoint: endpointIdentity(chat.baseURL), apiKey: chatKey },
    draft: { endpoint: endpointIdentity(draft.baseURL), apiKey: draftKey },
  }))
}

export function countWords(text) {
  return text.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)?.length ?? 0
}

export function bookMarkdown(book) {
  return [`# ${book.title}`, ...book.chapters.map(chapter => `## ${chapter.title}\n\n${chapter.text}`.trimEnd())].join('\n\n') + '\n'
}
