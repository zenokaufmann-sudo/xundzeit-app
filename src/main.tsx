import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { db } from './db/db'
import './styles.css'

if (import.meta.env.VITE_E2E) {
  ;(window as unknown as { __db: typeof db }).__db = db
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
