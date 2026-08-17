import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import ClockProvider from './context/ClockProvider.jsx'
import ConsentProvider from './context/ConsentProvider.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ConsentProvider>
        <ClockProvider>
          <App />
        </ClockProvider>
      </ConsentProvider>
    </BrowserRouter>
  </StrictMode>,
)
