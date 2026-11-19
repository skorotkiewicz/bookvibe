import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'
import { bookvibeApi } from './server/api.js'

export default defineConfig({
  plugins: [svelte(), bookvibeApi()],
})
