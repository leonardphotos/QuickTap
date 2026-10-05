import { useEffect, useRef, useState } from 'react';

/** Solo vive mientras Cocina está montada. La primera carga es una referencia, no una llegada. */
export function useKitchenArrival() {
  const seen = useRef<Set<string> | null>(null);
  const alive = useRef(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [soundReady, setSoundReady] = useState(false);
  const [soundError, setSoundError] = useState('');

  useEffect(() => {
    alive.current = true;
    seen.current = null;
    const player = new Audio('/sounds/cocina.mp3');
    player.preload = 'auto';
    audio.current = player;
    const stop = () => { if (document.visibilityState !== 'visible') { player.pause(); player.currentTime = 0; } };
    document.addEventListener('visibilitychange', stop);
    return () => {
      alive.current = false;
      player.pause();
      player.removeAttribute('src');
      player.load();
      audio.current = null;
      document.removeEventListener('visibilitychange', stop);
    };
  }, []);

  async function activateSound() {
    const player = audio.current;
    if (!player || document.visibilityState !== 'visible') return;
    // Desbloquea el elemento por interacción, sin reproducir una falsa llegada.
    player.muted = true;
    try {
      await player.play();
      player.pause();
      player.currentTime = 0;
      if (alive.current) { setSoundReady(true); setSoundError(''); }
    } catch {
      if (alive.current) setSoundError('No se pudo activar el audio. Revisa los permisos de sonido del navegador.');
    } finally { player.muted = false; }
  }

  function observe(keys: string[]) {
    if (!alive.current) return;
    const current = new Set(keys);
    const arrivals = seen.current ? keys.filter(key => !seen.current!.has(key)) : [];
    if (!seen.current) seen.current = new Set();
    keys.forEach(key => seen.current!.add(key));
    setFresh(previous => new Set([...previous, ...arrivals].filter(key => current.has(key))));
    const player = audio.current;
    if (!arrivals.length || !player || document.visibilityState !== 'visible') return;
    // Un aviso por lote; los eventos repetidos y cambios de estado no repiten el sonido.
    player.currentTime = 0;
    void player.play().then(() => {
      if (!alive.current || document.visibilityState !== 'visible') player.pause();
      else { setSoundReady(true); setSoundError(''); }
    }).catch(() => {
      if (alive.current) { setSoundReady(false); setSoundError('Pulsa Activar sonido para escuchar las nuevas comandas.'); }
    });
  }

  function acknowledge() {
    setFresh(new Set());
    audio.current?.pause();
  }
  return { observe, fresh, acknowledge, activateSound, soundReady, soundError };
}
