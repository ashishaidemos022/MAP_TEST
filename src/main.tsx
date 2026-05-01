import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { ActiveStudentProvider } from './lib/activeStudent'
import { AuthProvider } from './lib/auth'
import { primeVoices } from './lib/tts'

primeVoices()
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = primeVoices
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ActiveStudentProvider>
          <App />
        </ActiveStudentProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
