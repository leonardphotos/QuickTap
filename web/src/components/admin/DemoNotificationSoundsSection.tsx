import { Bike,BellRing,Volume2 } from 'lucide-react';
import { useRef,useState } from 'react';
import { notifyNative } from '@/utils/nativeNotify';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard,TextureCardContent,TextureCardHeader,TextureCardTitle } from '@/components/ui/texture-card';

type DemoSound = 'order' | 'delivery';

const DEMO_SOUNDS: Record<DemoSound, { src: string; title: string; body: string }> = {
  order: {
    src: '/sounds/pedido-nuevo.mp3',
    title: 'Nuevo pedido — Mesa 8',
    body: '1x Big Bite Clásica, 1x Papas',
  },
  delivery: {
    src: '/sounds/pedido-delivery.mp3',
    title: 'Nuevo pedido — María Gómez',
    body: 'Delivery · 2 productos',
  },
};

/** Controles de audio exclusivos del restaurante de demostración. No crean pedidos,
 * no publican eventos por socket y no aparecen en restaurantes reales. */
export function DemoNotificationSoundsSection() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<DemoSound | null>(null);

  function playDemo(kind: DemoSound) {
    audioRef.current?.pause();
    const sound = DEMO_SOUNDS[kind];
    const audio = new Audio(sound.src);
    audioRef.current = audio;
    setPlaying(kind);
    audio.onended = () => setPlaying((current) => (current === kind ? null : current));
    audio.onerror = () => setPlaying((current) => (current === kind ? null : current));
    audio.play().catch(() => setPlaying((current) => (current === kind ? null : current)));
    void notifyNative({ title: sound.title, body: sound.body });
  }

  return (
    <TextureCard>
      <TextureCardHeader className="px-6">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/10 text-brand-500">
            <Volume2 className="h-4 w-4" />
          </span>
          <TextureCardTitle className="pl-0">Probar notificaciones</TextureCardTitle>
        </div>
        <p className="font-light text-brand-950/60 text-base">
          Prueba el sonido y la notificación sin generar una comanda real. Este control solo está disponible en Big Bite Burgers Demo.
        </p>
      </TextureCardHeader>
      <TextureCardContent className="flex flex-col gap-2 sm:flex-row">
        <TextureButton
          variant="brand"
          size="default"
          className="!w-full sm:!w-auto"
          onClick={() => playDemo('order')}
        >
          <BellRing className="h-4 w-4" />
          {playing === 'order' ? 'Reproduciendo…' : 'Probar pedido nuevo'}
        </TextureButton>
        <TextureButton
          variant="secondary"
          size="default"
          className="!w-full sm:!w-auto"
          onClick={() => playDemo('delivery')}
        >
          <Bike className="h-4 w-4" />
          {playing === 'delivery' ? 'Reproduciendo…' : 'Probar delivery'}
        </TextureButton>
      </TextureCardContent>
    </TextureCard>
  );
}
