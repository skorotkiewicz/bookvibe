<script>
  import Icon from './Icon.svelte'

  let { text } = $props()
  const synth = window.speechSynthesis
  const supported = Boolean(synth && window.SpeechSynthesisUtterance)
  const preferencesKey = 'bookvibe.read-aloud.voice.v1'
  let preferences = $state(loadPreferences())
  let browserVoices = $state.raw([])
  let dispatcherVoices = $state.raw(null)
  let pickerOpen = $state(false)
  let pickerError = $state('')
  let voiceRequest
  let current
  let playback
  let reading = $state(false)
  let error = $state('')
  let label = $derived(reading ? 'Stop reading' : 'Read aloud')

  $effect(() => {
    if (supported) {
      refreshBrowserVoices()
      synth.addEventListener('voiceschanged', refreshBrowserVoices)
    }
    return () => {
      if (supported) synth.removeEventListener('voiceschanged', refreshBrowserVoices)
      voiceRequest?.abort()
      stop()
    }
  })

  function loadPreferences() {
    try {
      return JSON.parse(localStorage.getItem(preferencesKey)) ?? {}
    } catch {
      return {}
    }
  }

  function refreshBrowserVoices() {
    browserVoices = synth.getVoices().filter(voice => voice.localService)
  }

  function dispatcherVoiceId(voice) {
    return voice ? JSON.stringify([voice.name, voice.lang]) : ''
  }

  async function requestSpeech(input, signal) {
    const response = await fetch('/api/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal,
    })
    const result = await response.json().catch(() => null)
    if (!response.ok || !result) {
      throw new Error(result?.error || 'Speech Dispatcher is unavailable through the local Bookvibe server.')
    }
    return result
  }

  async function togglePicker() {
    pickerOpen = !pickerOpen
    if (!pickerOpen) return
    error = ''
    if (supported) refreshBrowserVoices()
    if (browserVoices.length || dispatcherVoices || voiceRequest) return

    const request = new AbortController()
    voiceRequest = request
    pickerError = ''
    try {
      const { voices } = await requestSpeech({ action: 'voices' }, request.signal)
      dispatcherVoices = [...new Map(voices.map(voice => [dispatcherVoiceId(voice), voice])).values()]
    } catch (failure) {
      if (!request.signal.aborted) pickerError = failure.message
    } finally {
      voiceRequest = undefined
    }
  }

  function chooseVoice(event) {
    const id = event.currentTarget.value
    if (browserVoices.length) preferences.browser = id
    else preferences.dispatcher = dispatcherVoices?.find(voice => dispatcherVoiceId(voice) === id) ?? null
    try {
      localStorage.setItem(preferencesKey, JSON.stringify(preferences))
    } catch {
      // The voice still applies to the current chapter.
    }
  }

  function stop() {
    if (current) {
      current = undefined
      synth.cancel()
    }
    playback?.abort()
    playback = undefined
    reading = false
  }

  async function readWithDispatcher(chapterText) {
    const request = new AbortController()
    playback = request
    reading = true
    try {
      await requestSpeech({ action: 'speak', text: chapterText, voice: preferences.dispatcher }, request.signal)
    } catch (failure) {
      if (!request.signal.aborted) error = failure.message
    } finally {
      if (playback === request) {
        playback = undefined
        reading = false
      }
    }
  }

  function toggle() {
    if (reading) {
      stop()
      return
    }

    error = ''
    pickerOpen = false
    if (supported) refreshBrowserVoices()
    if (!browserVoices.length) {
      readWithDispatcher(text)
      return
    }
    const voice = browserVoices.find(item => item.voiceURI === preferences.browser)
      ?? browserVoices.find(item => item.default)
      ?? browserVoices.find(item => item.lang === navigator.language)
      ?? browserVoices[0]

    // Keep utterances short so the speech engine can read a full chapter.
    const chunks = text.trim().split(/\n\s*\n/u).flatMap(paragraph =>
      paragraph.match(/\S[\s\S]{0,219}(?=\s|$)|\S{1,220}/gu) ?? []
    )
    let index = 0
    reading = true
    speakNext()

    function speakNext() {
      const chunk = chunks[index++]
      if (!chunk) {
        current = undefined
        reading = false
        return
      }
      const utterance = new window.SpeechSynthesisUtterance(chunk)
      utterance.voice = voice
      utterance.lang = voice.lang
      utterance.onend = () => {
        if (current === utterance) speakNext()
      }
      utterance.onerror = event => {
        if (current !== utterance) return
        current = undefined
        reading = false
        if (event.error !== 'canceled' && event.error !== 'interrupted') {
          error = 'The system voice could not read this chapter.'
        }
      }
      current = utterance
      synth.speak(utterance)
    }
  }
</script>

<svelte:window onpagehide={stop} onkeydown={(event) => { if (event.key === 'Escape') pickerOpen = false }} />

<button class="icon-btn" class:chosen={reading} type="button" aria-label={label}
  title={label} disabled={!reading && !text.trim()} onclick={toggle}>
  <Icon name={reading ? 'stop' : 'volume'} size={17} />
</button>
<button class="icon-btn voice-picker" class:chosen={pickerOpen} type="button" aria-label="Choose voice"
  title="Choose voice" aria-expanded={pickerOpen} onclick={togglePicker}>
  <Icon name="down" size={13} />
</button>
{#if pickerOpen}
  <div class="voice-options">
    <label>
      Voice
      <select onchange={chooseVoice} value={browserVoices.length ? preferences.browser ?? '' : dispatcherVoiceId(preferences.dispatcher)}>
        <option value="">System default</option>
        {#each browserVoices as voice (voice.voiceURI)}
          <option value={voice.voiceURI}>{voice.name} ({voice.lang})</option>
        {/each}
        {#if !browserVoices.length}
          {#each dispatcherVoices ?? [] as voice (dispatcherVoiceId(voice))}
            <option value={dispatcherVoiceId(voice)}>{voice.name}{voice.lang ? ` (${voice.lang})` : ''}</option>
          {/each}
        {/if}
      </select>
    </label>
    {#if !browserVoices.length && !dispatcherVoices}
      <p role="status">{pickerError || 'Loading system voices…'}</p>
    {/if}
  </div>
{/if}
{#if error}<p class="speech-error" role="status">{error}</p>{/if}

<style>
  .voice-picker {
    width: 24px;
    margin-inline-start: -4px;
  }

  .voice-options, .speech-error {
    position: absolute;
    z-index: 1;
    top: calc(100% + 6px);
    inset-inline-end: 14px;
    max-width: calc(100% - 28px);
    padding: 7px 10px;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: var(--surface);
    white-space: normal;
  }

  .voice-options {
    width: 260px;
    padding: 10px;
  }

  .voice-options label {
    display: grid;
    gap: 5px;
  }

  .voice-options select {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 6px;
    background: var(--chrome);
    color: var(--text);
  }

  .voice-options p {
    margin-top: 6px;
    color: var(--muted);
  }

  .speech-error { color: var(--accent-strong); }
</style>
