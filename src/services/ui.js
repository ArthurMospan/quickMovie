// --- Спільні UI-хелпери: копіювання в буфер + вібрація (Telegram haptic) ---

export const copyToClipboard = (text) => {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
  }
  legacyCopy(text);
  return Promise.resolve();
};

const legacyCopy = (text) => {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) { /* ignore */ }
  document.body.removeChild(ta);
};

// Вібрація: у Telegram — нативний HapticFeedback (працює і на iOS),
// поза Telegram — navigator.vibrate (Android-браузери).
export const haptic = (style = 'medium') => {
  const h = window.Telegram?.WebApp?.HapticFeedback;
  try {
    if (style === 'success' && typeof h?.notificationOccurred === 'function') {
      h.notificationOccurred('success');
      return;
    }
    if (typeof h?.impactOccurred === 'function') {
      h.impactOccurred(style);
      return;
    }
  } catch (e) { /* старий клієнт */ }
  try { navigator.vibrate?.(35); } catch (e) { /* not supported */ }
};
