import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

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
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
