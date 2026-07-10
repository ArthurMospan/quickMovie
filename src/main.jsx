import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// --- Telegram Mini App Init ---
try {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    // Disable vertical swipe-to-close so feed scrolling works properly
    try { tg.disableVerticalSwipes(); } catch (e) { /* Not supported in this version */ }
    // Request fullscreen if available (Telegram Bot API 8.0+)
    try { tg.requestFullscreen(); } catch (e) { /* Not supported in this version */ }
    // Match Telegram theme
    document.documentElement.style.setProperty('--tg-viewport-height', `${tg.viewportHeight}px`);
    document.documentElement.style.setProperty('--tg-viewport-stable-height', `${tg.viewportStableHeight}px`);
  }
} catch (e) {
  // Not running in Telegram — that's fine, app works standalone too
  console.log('[TG] Not running inside Telegram Mini App');
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
