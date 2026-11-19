<script>
  import Icon from './Icon.svelte'

  let { text } = $props()
  const synth = window.speechSynthesis
  const supported = Boolean(synth && window.SpeechSynthesisUtterance)
  let current
  let reading = $state(false)
  let error = $state('')
  let label = $derived(reading ? 'Stop reading' : 'Read aloud')

  $effect(() => {
    if (supported) synth.getVoices()
    return stop
  })

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
    const voices = synth.getVoices().filter(voice => voice.localService)
    const voice = voices.find(item => item.default) ?? voices.find(item => item.lang === navigator.language) ?? voices[0]
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
{#if error}<p class="speech-error" role="status">{error}</p>{/if}

<style>
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
