import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import './index.css';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

// Vacío si aún no se configuró VITE_GOOGLE_CLIENT_ID (ver web/.env) — el botón de Google
// simplemente no aparece funcional hasta que se cargue, no rompe el resto de la app.
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

// Vite dispara este evento cuando un <link rel="modulepreload"> falla — misma causa que
// ErrorBoundary cubre para un import() dinámico (chunk de una versión ya borrada del
// servidor), pero por una vía que no pasa por el render de React. Sin este listener, Vite
// solo lo deja como una promesa rechazada sin manejar: no rompe nada visible de inmediato,
// pero tampoco se recupera solo.
window.addEventListener('vite:preloadError', () => {
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </GoogleOAuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
