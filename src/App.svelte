<script>
  import { tick } from 'svelte'
  import ChapterReadAloud from './lib/ChapterReadAloud.svelte'
  import Icon from './lib/Icon.svelte'
  import ModelSettings from './lib/ModelSettings.svelte'
  import { bookMarkdown, countWords, loadBooks, loadSettings, newBook, saveBooks, saveSettings } from './lib/books.js'

  const initial = loadBooks()
  let workspace = $state(initial.data)
  let lastSaved = initial.stored
  let lastSnapshot = JSON.stringify(initial.data)
  let settings = $state(loadSettings())
  let book = $derived(workspace.books.find(item => item.id === workspace.activeId) ?? workspace.books[0])
  let chapter = $derived(book.chapters.find(item => item.id === book.activeChapterId) ?? book.chapters[0])
  let chapterIndex = $derived(book.chapters.indexOf(chapter))
  let chapterWords = $derived(countWords(chapter.text))
  let totalWords = $derived(book.chapters.reduce((total, item) => total + countWords(item.text), 0))
  let paragraphs = $derived(chapter.text.split(/\n\s*\n/).map(text => text.trim()).filter(Boolean))
  let draftReady = $derived(Boolean((settings.shared ? settings.chat : settings.draft).model))
  let connected = $derived(Boolean(settings.chat.model) && draftReady)

  let pane = $state('manuscript')
  let focus = $state(false)
  let library = $state(false)
  let busy = $state(false)
  let editing = $state(false)
  let editTitle = $state('')
  let editText = $state('')
  let input = $state('')
  let autoDraft = $state(true)
  let storageIssue = $state(false)
  let storageConflict = $state(false)
  let settingsDialog = $state()
  let nameDialog = $state()
  let nameAction = $state('new-book')
  let nameValue = $state('')
  let chatLog = $state()
  let composer = $state()
  let page = $state()
  let nameHeading = $derived({ 'new-book': 'New book', 'new-chapter': 'New chapter', rename: 'Rename book' }[nameAction])

  $effect(() => {
    const snapshot = JSON.stringify(workspace)
    if (snapshot === lastSnapshot) return
    lastSnapshot = snapshot
    persistBooks(snapshot)
  })

  async function persistBooks(snapshot) {
    const write = () => {
      const saved = saveBooks(snapshot, lastSaved)
      storageConflict = saved === null
      if (saved !== null) lastSaved = saved
    }
    try {
      if (navigator.locks) await navigator.locks.request('bookvibe.books.v1', write)
      else write()
      storageIssue = false
    } catch {
      storageIssue = true
    }
  }

  function updateSettings(value) {
    settings = value
    try {
      saveSettings(value)
    } catch {
      storageIssue = true
    }
  }

  function openName(action) {
    library = false
    nameAction = action
    nameValue = action === 'rename' ? book.title : ''
    nameDialog.showModal()
  }

  function applyName(event) {
    event.preventDefault()
    const title = nameValue.trim()
    if (!title) return
    if (nameAction === 'new-book') {
      const next = newBook(title)
      workspace.books.push(next)
      selectBook(next.id)
    } else if (nameAction === 'new-chapter') {
      const id = crypto.randomUUID()
      book.chapters.push({ id, title, text: '' })
      selectChapter(id)
    } else {
      book.title = title
    }
    nameDialog.close()
  }

  function selectBook(id) {
    workspace.activeId = id
    library = false
    editing = false
    input = ''
    pane = 'manuscript'
    if (page) page.scrollTop = 0
  }

  function selectChapter(id) {
    book.activeChapterId = id
    pane = 'manuscript'
    if (page) page.scrollTop = 0
  }

  function startEditing() {
    editTitle = chapter.title
    editText = chapter.text
    editing = true
  }

  function saveChapter(event) {
    event.preventDefault()
    if (!editTitle.trim()) return
    chapter.title = editTitle.trim()
    chapter.text = editText.trim()
    editing = false
  }

  function exportBook() {
    const url = URL.createObjectURL(new Blob([bookMarkdown(book)], { type: 'text/markdown;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = (book.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim() || 'manuscript') + '.md'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function scrollChat() {
    await tick()
    if (chatLog) chatLog.scrollTop = chatLog.scrollHeight
  }

  async function suggest(question) {
    input = question
    autoDraft = false
    await tick()
    composer?.focus()
  }

  function hasConnection(kinds) {
    const missing = kinds.some(kind => {
      const config = kind === 'chat' || settings.shared ? settings.chat : settings.draft
      return !config.baseURL || !config.model
    })
    if (missing) settingsDialog.open('Set an API base URL and model ID to start.')
    return !missing
  }

  async function sendMessage(event) {
    event?.preventDefault()
    if (busy || editing || !input.trim()) return
    const kinds = autoDraft ? ['chat', 'draft'] : ['chat']
    if (!hasConnection(kinds)) return
    const id = crypto.randomUUID()
    book.turns.push({
      id, chapterId: chapter.id, content: input.trim(), reply: '', count: 0,
      chatState: 'pending', draftState: autoDraft ? 'pending' : 'off',
    })
    input = ''
    await runTurn(book.turns.at(-1), kinds)
    await tick()
    composer?.focus()
  }

  async function retry(turn, kind) {
    if (busy || editing || !hasConnection([kind])) return
    await runTurn(turn, [kind])
  }

  async function runTurn(turn, kinds) {
    busy = true
    const target = book.chapters.find(item => item.id === turn.chapterId)
    const turns = book.turns.slice(0, book.turns.indexOf(turn) + 1)
    const messages = turns.flatMap(item => {
      const user = { role: 'user', content: item.content }
      return item !== turn && item.reply ? [user, { role: 'assistant', content: item.reply }] : [user]
    })
    const context = {
      title: book.title,
      chapters: book.chapters.map(({ id, title, text }) => ({ id, title, text })),
      chapterId: turn.chapterId,
      messages,
    }

    const requests = kinds.map(async kind => {
      turn[kind + 'State'] = 'pending'
      turn[kind + 'Error'] = ''
      try {
        const config = kind === 'chat' || settings.shared ? settings.chat : settings.draft
        const response = await fetch('/api/story', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...context, kind, config }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error)
        if (typeof result.text !== 'string' || !result.text.trim()) throw new Error('The model returned an empty response.')
        if (kind === 'chat') {
          turn.reply = result.text.trim()
        } else {
          const prose = result.text.trim()
          target.text = [target.text.trimEnd(), prose].filter(Boolean).join('\n\n')
          turn.count = countWords(prose)
        }
        turn[kind + 'State'] = 'done'
      } catch (error) {
        turn[kind + 'Error'] = error instanceof SyntaxError
          ? 'The local model service did not reply. Restart Bookvibe and retry.'
          : error.message
        turn[kind + 'State'] = 'error'
      }
      await scrollChat()
    })
    await scrollChat()
    await Promise.all(requests)
    busy = false
  }

  function composerKeys(event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      sendMessage()
    }
  }
</script>

<svelte:window onkeydown={(event) => {
  if (event.key === 'Escape') {
    library = false
    if (!nameDialog?.open && !document.querySelector('.settings-dialog[open]')) focus = false
  }
}} />

<div class="workspace" class:focus-mode={focus} data-pane={pane}>
  <header class="topbar">
    <div class="brand">
      <div class="brand-mark"><Icon name="quill" size={21} /></div>
      <span>Bookvibe<span class="brand-period">.</span></span>
    </div>
    <div class="breadcrumb">
      <Icon name="book" size={16} />
      <span class="book-crumb">{book.title}</span>
      <Icon name="chevron" size={12} />
      <span>{chapter.title}</span>
    </div>
    <div class="top-actions">
      <button class="ghost-btn" type="button" onclick={() => settingsDialog.open()}><Icon name="settings" size={17} /><span>Models</span></button>
      <button class="outline-btn" type="button" onclick={exportBook} title="Export manuscript as Markdown"><Icon name="download" size={16} /><span>Export</span></button>
    </div>
  </header>

  <nav class="mobile-nav" aria-label="Workspace panels">
    <button class:current={pane === 'contents'} aria-pressed={pane === 'contents'} onclick={() => pane = 'contents'}><Icon name="panel" size={16} /> Contents</button>
    <button class:current={pane === 'manuscript'} aria-pressed={pane === 'manuscript'} onclick={() => pane = 'manuscript'}><Icon name="book" size={16} /> Manuscript</button>
    <button class:current={pane === 'chat'} aria-pressed={pane === 'chat'} onclick={() => { pane = 'chat'; scrollChat() }}><Icon name="chat" size={16} /> Story chat</button>
  </nav>

  <div class="panels">
    <aside class="contents" aria-label="Book contents">
      <div class="panel-header contents-header">
        <span class="panel-title"><Icon name="panel" size={17} /> Contents</span>
        <button class="icon-btn" type="button" aria-label="Book library" title="Book library" aria-expanded={library} onclick={() => library = !library}><Icon name="dots" size={18} /></button>
        {#if library}
          <div class="library-menu">
            <p>Your books</p>
            {#each workspace.books as item (item.id)}
              <button type="button" class:current={item.id === book.id} disabled={busy || editing} onclick={() => selectBook(item.id)}>{item.title}{#if item.id === book.id}<Icon name="check" size={14} />{/if}</button>
            {/each}
            <div class="menu-divider"></div>
            <button type="button" disabled={busy || editing} onclick={() => openName('new-book')}><span>New book</span><Icon name="plus" size={15} /></button>
            <button type="button" disabled={busy || editing} onclick={() => openName('rename')}><span>Rename book</span><Icon name="edit" size={14} /></button>
          </div>
        {/if}
      </div>
      <div class="contents-scroll">
        <div class="book-card">
          {#if book.id === 'sample'}
            <img class="cover" src="{import.meta.env.BASE_URL}quiet-tides.webp" width="83" height="116" alt="A lighthouse above a stormy coastline" />
          {:else}
            <div class="cover blank-cover"><Icon name="book" size={30} /></div>
          {/if}
          <div class="book-info">
            <h2>{book.title}</h2>
            <p>{totalWords.toLocaleString()} words</p>
          </div>
        </div>
        <div class="chapter-heading">
          <h3>Chapters</h3>
          <button class="icon-btn" type="button" title="New chapter" aria-label="New chapter" disabled={busy || editing} onclick={() => openName('new-chapter')}><Icon name="plus" size={17} /></button>
        </div>
        <nav class="chapter-list" aria-label="Chapters">
          {#each book.chapters as item, index (item.id)}
            <button type="button" class:active={item.id === chapter.id} aria-current={item.id === chapter.id ? 'page' : undefined} disabled={editing} onclick={() => selectChapter(item.id)}>
              <span class="chapter-number">{String(index + 1).padStart(2, '0')}</span>
              <span class="chapter-info"><span>{item.title}</span><small>{item.text.trim() ? `${countWords(item.text).toLocaleString()} words` : 'Empty chapter'}</small></span>
            </button>
          {/each}
        </nav>
        <button class="new-chapter" type="button" disabled={busy || editing} onclick={() => openName('new-chapter')}><Icon name="plus" size={16} /> Add chapter</button>
      </div>
      <button type="button" class="connection" onclick={() => settingsDialog.open()}>
        <span class="connection-dot" class:connected></span><span>{connected ? 'Models configured' : 'Connect a model'}</span><Icon name="chevron" size={13} />
      </button>
    </aside>

    <main class="manuscript" aria-labelledby="chapter-title">
      <div class="panel-header manuscript-header">
        <span class="panel-title"><Icon name="book" size={17} /> Manuscript</span>
        <div class="panel-actions">
          {#if !editing}
            {#key chapter.id}
              <ChapterReadAloud text={chapter.text} />
            {/key}
            <button class="ghost-btn edit-button" type="button" aria-label="Edit chapter" title="Edit chapter" onclick={startEditing} disabled={busy}><Icon name="edit" size={15} /> <span>Edit chapter</span></button>
          {/if}
          <button class="icon-btn focus-button" class:chosen={focus} type="button" aria-pressed={focus} aria-label="Focus mode" title="Focus mode" onclick={() => focus = !focus}><Icon name="focus" size={17} /></button>
        </div>
      </div>
      <div class="paper-scroll" bind:this={page}>
        <article class="paper">
          <div class="chapter-mast">
            <p>Chapter {String(chapterIndex + 1).padStart(2, '0')}</p>
            <h1 id="chapter-title">{chapter.title}</h1>
            <div class="chapter-rule"><span></span><Icon name="spark" size={11} /><span></span></div>
          </div>
          {#if editing}
            <form class="edit-form" onsubmit={saveChapter}>
              <label>Chapter title <input required bind:value={editTitle} /></label>
              <label>Chapter text <textarea rows="11" bind:value={editText} placeholder="Write the first paragraph"></textarea></label>
              <div class="edit-actions">
                <button class="ghost-btn" type="button" onclick={() => editing = false}>Cancel</button>
                <button class="primary-btn" type="submit">Save chapter</button>
              </div>
            </form>
          {:else if paragraphs.length}
            <div class="prose">
              {#each paragraphs as paragraph}
                <p>{paragraph}</p>
              {/each}
            </div>
            <div class="end-mark" aria-hidden="true"><span></span><span></span><span></span></div>
          {:else}
            <div class="empty-page">
              <Icon name="quill" size={31} />
              <p>This chapter is waiting for a first line.</p>
              <button class="text-btn" type="button" disabled={busy} onclick={startEditing}>Start writing</button>
            </div>
          {/if}
        </article>
      </div>
    </main>

    <aside class="chat" aria-label="Story chat">
      <div class="panel-header chat-header">
        <span class="panel-title"><Icon name="chat" size={19} /> Story chat</span>
        {#if busy}<span class="live-status" role="status"><i></i> Working</span>{/if}
      </div>
      <div class="chat-log" bind:this={chatLog} aria-live="polite" aria-relevant="additions text">
        {#if book.turns.length}
          {#if book.id === 'sample'}
            <div class="chat-divider"><span></span> Sample conversation <span></span></div>
          {/if}
          {#each book.turns as turn (turn.id)}
            <div class="turn">
              <div class="message you">
                <div class="message-label"><span class="avatar"><Icon name="user" size={14} /></span> You</div>
                <p>{turn.content}</p>
              </div>
              {#if turn.reply || turn.chatState === 'pending'}
                <div class="message assistant">
                  <div class="message-label"><span class="avatar"><Icon name="spark" size={13} /></span> Bookvibe</div>
                  <p class:thinking={!turn.reply}>{turn.reply || 'Thinking…'}</p>
                </div>
              {/if}
              {#if turn.chatState === 'error'}
                <div class="turn-error">
                  <p>{turn.chatError || 'The chat reply was interrupted.'}</p>
                  <button type="button" class="text-btn" disabled={busy || editing} onclick={() => retry(turn, 'chat')}>Retry reply</button>
                </div>
              {/if}
              {#if turn.draftState === 'done'}
                <button type="button" class="draft-note" disabled={editing} onclick={() => selectChapter(turn.chapterId)}>
                  <span class="note-icon"><Icon name="quill" size={15} /></span>
                  <span><strong>Added to manuscript</strong><small>{book.chapters.find(item => item.id === turn.chapterId)?.title} · +{turn.count} words</small></span>
                  <Icon name="chevron" size={14} />
                </button>
              {:else if turn.draftState === 'pending'}
                <div class="draft-note pending"><span class="note-icon"><Icon name="quill" size={15} /></span> Drafting new paragraphs…</div>
              {:else if turn.draftState === 'error'}
                <div class="turn-error">
                  <p>{turn.draftError || 'Drafting was interrupted.'}</p>
                  <button type="button" class="text-btn" disabled={busy || editing} onclick={() => retry(turn, 'draft')}>Retry draft</button>
                </div>
              {/if}
            </div>
          {/each}
        {:else}
          <div class="chat-empty">
            <span><Icon name="spark" size={27} /></span>
            <h2>How does it begin?</h2>
            <p>Tell me a memory or a scene. I’ll reply here and draft the next paragraphs in your chapter.</p>
          </div>
        {/if}
      </div>
      <div class="chat-bottom">
        {#if totalWords > 0}
          <div class="suggestions">
            <button type="button" onclick={() => suggest('What threads are still open in this book?')} disabled={busy}><Icon name="threads" size={15} /> Open threads</button>
            <button type="button" onclick={() => suggest('What connections do you see across the manuscript?')} disabled={busy}><Icon name="spark" size={13} /> Find connections</button>
          </div>
        {/if}
        <form class="composer" onsubmit={sendMessage}>
          <textarea rows="2" bind:this={composer} bind:value={input} onkeydown={composerKeys} placeholder="Tell me what happened next…" aria-label="Message for Bookvibe"></textarea>
          <div class="composer-tools">
            <button type="button" class="mode-button" aria-pressed={autoDraft} title="Toggle automatic drafting" disabled={busy} onclick={() => autoDraft = !autoDraft}><Icon name={autoDraft ? 'quill' : 'chat'} size={15} /> {autoDraft ? 'Chat & draft' : 'Chat only'} <Icon name="down" size={12} /></button>
            <button type="submit" class="send-button" aria-label="Send message" disabled={busy || editing || !input.trim()}><Icon name="send" size={17} /></button>
          </div>
        </form>
        <div class="composer-hint">Enter to send <span>·</span> Shift + Enter for a new line</div>
      </div>
    </aside>
  </div>

  <footer class="statusbar">
    <span class:save-warning={storageIssue || storageConflict} role="status">
      <Icon name={storageIssue || storageConflict ? 'close' : 'check'} size={14} />
      {storageConflict ? 'Another tab saved changes. Export this draft before reloading.' : storageIssue ? 'Browser storage unavailable' : 'Saved on this device'}
    </span>
    <span class="counts"><span>{chapterWords.toLocaleString()} words in chapter</span><i></i><span>{totalWords.toLocaleString()} total</span></span>
  </footer>
</div>

<ModelSettings bind:this={settingsDialog} {settings} onsave={updateSettings} />

<dialog bind:this={nameDialog} class="dialog name-dialog" aria-labelledby="name-heading">
  <form onsubmit={applyName}>
    <div class="dialog-heading">
      <h2 id="name-heading">{nameHeading}</h2>
      <button class="icon-btn" type="button" aria-label="Close" onclick={() => nameDialog.close()}><Icon name="close" /></button>
    </div>
    <label>Title<input type="text" bind:value={nameValue} maxlength="120" required placeholder={nameAction === 'new-chapter' ? 'Chapter title' : 'Book title'} /></label>
    <div class="dialog-actions"><button class="primary-btn" type="submit">{nameAction === 'rename' ? 'Save title' : nameHeading === 'New book' ? 'Create book' : 'Create chapter'}</button></div>
  </form>
</dialog>
