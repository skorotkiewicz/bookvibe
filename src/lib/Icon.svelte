<script>
  let { name, size = 18 } = $props()
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if name === 'book'}
    <path d="M12 6C9 4 5.5 4 3 5v14c2.5-1 6-1 9 1 3-2 6.5-2 9-1V5c-2.5-1-6-1-9 1Zm0 0v14"/>
  {:else if name === 'quill'}
    <path d="M21 3c-5 0-10 1.8-13.5 7L5 19l8.5-3c5-3.5 7-8 7.5-13ZM3 21l11-10m-7 6 6-.5"/>
  {:else if name === 'pages'}
    <path d="M7 3h7l4 4v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm7 0v5h4M9 12h5m-5 4h5"/>
  {:else if name === 'settings'}
    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-1.91 1.91-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V20h-2.7v-.09a1.65 1.65 0 0 0-1.3-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06-1.91-1.91.06-.06A1.65 1.65 0 0 0 7.6 15a1.65 1.65 0 0 0-1.5-1H6v-2.7h.09A1.65 1.65 0 0 0 7.6 10a1.65 1.65 0 0 0-.33-1.82l-.06-.06 1.91-1.91.06.06A1.65 1.65 0 0 0 11 6.6a1.65 1.65 0 0 0 1-1.51V5h2.7v.09A1.65 1.65 0 0 0 16 6.6a1.65 1.65 0 0 0 1.82-.33l.06-.06 1.91 1.91-.06.06A1.65 1.65 0 0 0 19.4 10a1.65 1.65 0 0 0 1.51 1H21v2.7h-.09A1.65 1.65 0 0 0 19.4 15Z" transform="translate(-.6 -.6)"/>
  {:else if name === 'download'}
    <path d="M12 3v12m-4-4 4 4 4-4M5 15v5h14v-5"/>
  {:else if name === 'plus'}
    <path d="M12 5v14M5 12h14"/>
  {:else if name === 'chevron'}
    <path d="m9 5 7 7-7 7"/>
  {:else if name === 'down'}
    <path d="m6 9 6 6 6-6"/>
  {:else if name === 'dots'}
    <circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>
  {:else if name === 'panel'}
    <rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 5v14"/>
  {:else if name === 'focus'}
    <path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/>
  {:else if name === 'edit'}
    <path d="m14 5 5 5M5 19l1-5L17 3l4 4-11 11-5 1Z"/>
  {:else if name === 'chat'}
    <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.4-3.6A7.5 7.5 0 1 1 20 11.5Z"/><path d="M9 11.5h7"/>
  {:else if name === 'spark'}
    <path d="M12 2c0 6-4 10-10 10 6 0 10 4 10 10 0-6 4-10 10-10-6 0-10-4-10-10Z"/>
  {:else if name === 'send'}
    <path d="m3 3 18 9-18 9 4-9-4-9Zm4 9h14"/>
  {:else if name === 'check'}
    <path d="m5 12 4 4L19 6"/>
  {:else if name === 'close'}
    <path d="m6 6 12 12M18 6 6 18"/>
  {:else if name === 'user'}
    <circle cx="12" cy="8" r="3"/><path d="M5 20c1-4 4-6 7-6s6 2 7 6"/>
  {:else if name === 'threads'}
    <circle cx="6" cy="6" r="2"/><circle cx="18" cy="7" r="2"/><circle cx="12" cy="18" r="2"/><path d="m7 8 4 8m6-7-4 7"/>
  {/if}
</svg>
