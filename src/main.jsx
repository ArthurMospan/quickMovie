import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// --- Telegram Mini App Init ---
if (window.Telegram?.WebApp) {
  const tg = window.Telegram.WebApp;
  tg.ready();
  tg.expand();
  // Disable vertical swipe-to-close so feed scrolling works properly
  if (tg.disableVerticalSwipes) {
    tg.disableVerticalSwipes();
  }
  // Request fullscreen if available (Telegram Bot API 8.0+)
  if (tg.requestFullscreen) {
    tg.requestFullscreen();
  }
  // Match Telegram theme
  document.documentElement.style.setProperty('--tg-viewport-height', `${tg.viewportHeight}px`);
  document.documentElement.style.setProperty('--tg-viewport-stable-height', `${tg.viewportStableHeight}px`);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Hide splash screen after React mounts
requestAnimationFrame(() => {
  const splash = document.getElementById('splash-screen');
  if (splash) {
    splash.classList.add('hidden');
    setTimeout(() => splash.remove(), 500);
  }
});
