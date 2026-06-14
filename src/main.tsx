import React from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from './lib/theme'
import { ToastProvider } from './lib/toast'
import { DialogProvider } from './lib/dialog'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <DialogProvider>
          <App />
        </DialogProvider>
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>
)
