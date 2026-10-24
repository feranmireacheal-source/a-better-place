import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Auth from './Auth'
import Admin from './Admin'
import Scanner from './Scanner'
import './index.css'

function Router() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => { const f = () => setHash(window.location.hash); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f) }, [])
  if (hash.startsWith('#/admin')) return <Auth role="admin"><Admin /></Auth>
  if (hash.startsWith('#/scan')) return <Auth role="staff"><Scanner /></Auth>
  return <App />
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Router /></React.StrictMode>)
