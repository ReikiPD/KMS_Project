import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@idds/react/index.css'
import './index.css'
import App from './App.jsx'
import { ToastProvider } from '@idds/react';
import AppErrorBoundary from './components/AppErrorBoundary';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <AppErrorBoundary><App /></AppErrorBoundary>
    </ToastProvider>
  </StrictMode>,
);
