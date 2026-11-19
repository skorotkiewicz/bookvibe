<script>
  import Icon from './Icon.svelte'
  import { endpointIdentity } from './books.js'

  let { settings, onsave } = $props()
  let dialog = $state()
  let form = $state()
  let reason = $state('')

  export function open(message = '') {
    form = $state.snapshot(settings)
    reason = message
    dialog.showModal()
  }

  function changeEndpoint(kind, value) {
    if (endpointIdentity(value) !== endpointIdentity(form[kind].baseURL)) form[kind].apiKey = ''
    form[kind].baseURL = value
  }

  function save(event) {
    event.preventDefault()
    for (const kind of form.shared ? ['chat'] : ['chat', 'draft']) {
      let url
      try { url = new URL(form[kind].baseURL.trim()) } catch { /* Invalid URL */ }
      if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        reason = 'Enter an HTTP or HTTPS API base URL without credentials, a query, or a fragment.'
        return
      }
      if (!form[kind].model.trim()) {
        reason = 'Enter a model ID for each connection you use.'
        return
      }
      form[kind].baseURL = form[kind].baseURL.trim()
      form[kind].model = form[kind].model.trim()
    }
    onsave($state.snapshot(form))
    dialog.close()
  }
</script>

<dialog bind:this={dialog} class="dialog settings-dialog" aria-labelledby="settings-title">
  {#if form}
    <form onsubmit={save}>
      <div class="dialog-heading">
        <h2 id="settings-title">Model settings</h2>
        <button class="icon-btn" type="button" aria-label="Close model settings" onclick={() => dialog.close()}><Icon name="close" /></button>
      </div>
      <p class="dialog-intro">Connect an OpenAI-compatible API. Bookvibe sends your manuscript and conversation to the models you choose.</p>
      <label class="shared-setting">
        <input type="checkbox" bind:checked={form.shared} />
        Use the same connection for chat and drafting
      </label>
      {#each (form.shared ? ['chat'] : ['chat', 'draft']) as kind (kind)}
        <fieldset>
          <legend>{form.shared ? 'Chat & drafting' : kind === 'chat' ? 'Story chat' : 'Manuscript drafting'}</legend>
          <label>API base URL <input type="url" required value={form[kind].baseURL} oninput={(event) => changeEndpoint(kind, event.currentTarget.value)} placeholder="https://api.openai.com/v1" /></label>
          <label>Model ID <input required bind:value={form[kind].model} placeholder="Your provider’s model ID" /></label>
          <label>API key <span class="optional">(if required)</span><input type="password" autocomplete="off" bind:value={form[kind].apiKey} placeholder="API key" /></label>
        </fieldset>
      {/each}
      {#if reason}<p class="form-error" role="status">{reason}</p>{/if}
      <div class="dialog-actions">
        <p>API keys are kept in this browser tab.</p>
        <button class="primary-btn" type="submit">Save settings</button>
      </div>
    </form>
  {/if}
</dialog>
