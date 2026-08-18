import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@idds/react/index.css'
import './index.css'
import App from './App.jsx'
import { ToastProvider } from '@idds/react';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);