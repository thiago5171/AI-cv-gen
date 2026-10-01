import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { claudeCliPlugin } from './scripts/vite-claude-plugin.mjs'
import { geminiApiPlugin } from './scripts/vite-gemini-plugin.mjs'
import { openrouterApiPlugin } from './scripts/vite-openrouter-plugin.mjs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), claudeCliPlugin(), geminiApiPlugin(), openrouterApiPlugin()],
})
