import '@fontsource-variable/fredoka';
import '@fontsource-variable/nunito';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { unlockAudio } from './lib/sound';

// El audio del navegador solo se habilita tras una interacción del usuario.
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
