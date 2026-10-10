import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import RootErrorBoundary from './components/RootErrorBoundary'
import { ComparisonProvider } from './context/ComparisonContext'

createRoot(document.getElementById('root')!).render(
  <RootErrorBoundary><StrictMode><AuthProvider><ComparisonProvider><App /></ComparisonProvider></AuthProvider></StrictMode></RootErrorBoundary>,
)
