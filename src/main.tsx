import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import RootErrorBoundary from './components/RootErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <RootErrorBoundary><StrictMode><AuthProvider><App /></AuthProvider></StrictMode></RootErrorBoundary>,
)
