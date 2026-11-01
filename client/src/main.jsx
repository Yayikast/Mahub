import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth.jsx'
import App from './App.jsx'
import './index.css'

// BrowserRouter gives every component access to the URL; AuthProvider gives every component
// access to "who is signed in". Both use React context, so nothing has to be passed down by hand.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
