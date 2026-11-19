<script>
  import Icon from './Icon.svelte'

  let { text } = $props()
  const synth = window.speechSynthesis
  const supported = Boolean(synth && window.SpeechSynthesisUtterance)
  const voicePreference = 'bookvibe.voice.v1'
  let voices = $state.raw([])
  let voiceId = $state(loadVoice())
  let current
  let reading = $state(false)
  let error = $state('')
  let label = $derived(reading ? 'Stop reading' : 'Read aloud')

  $effect(() => {
    if (supported) {
      refreshVoices()
      synth.addEventListener('voiceschanged', refreshVoices)
    }
    return () => {
      if (supported) synth.removeEventListener('voiceschanged', refreshVoices)
      stop()
    }
  })

  function loadVoice() {
    try {
      return localStorage.getItem(voicePreference) ?? ''
    } catch {
      return ''
    }
  }

  function refreshVoices() {
    voices = synth.getVoices().filter(voice => voice.localService)
  }

  function chooseVoice(event) {
    voiceId = event.currentTarget.value
    try {
      localStorage.setItem(voicePreference, voiceId)
    } catch {
      // The selected voice is still available for this chapter.
    }
  }

  function stop() {
    if (!current) return
    current = undefined
    reading = false
    synth.cancel()
  }

  function toggle() {
    if (reading) {
      stop()
      return
    }

    error = ''
    refreshVoices()
    const voice = voices.find(item => voiceId && item.voiceURI === voiceId)
      ?? voices.find(item => item.default)
      ?? voices.find(item => item.lang === navigator.language)
      ?? voices[0]
    if (!voice) {
      error = 'No system voice is available.'
      return
    }

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

<svelte:window onpagehide={stop} />

<button class="icon-btn" class:chosen={reading} type="button" aria-label={label}
  title={supported ? label : 'Read aloud is unavailable in this browser'}
  disabled={!supported || !text.trim()} onclick={toggle}>
  <Icon name={reading ? 'stop' : 'volume'} size={17} />
</button>
<select class="voice-picker" aria-label="Read-aloud voice" title="Read-aloud voice"
  value={voices.some(voice => voice.voiceURI === voiceId) ? voiceId : ''}
  disabled={!voices.length} onchange={chooseVoice}>
  <option value="">Default</option>
  {#each voices as voice}
    <option value={voice.voiceURI}>{voice.name} ({voice.lang})</option>
  {/each}
</select>
{#if error}<p class="speech-error" role="status">{error}</p>{/if}

<style>
  .voice-picker {
    width: 124px;
    height: 34px;
    padding-inline: 7px 4px;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: var(--chrome);
    color: var(--muted);
    font: inherit;
  }

  @media (min-width: 791px) and (max-width: 855px), (max-width: 430px) {
    .voice-picker { width: 90px; }
  }

  .speech-error {
    position: absolute;
    z-index: 1;
    top: calc(100% + 6px);
    inset-inline-end: 14px;
    max-width: calc(100% - 28px);
    padding: 7px 10px;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: var(--surface);
    color: var(--accent-strong);
    white-space: normal;
  }
</style>
