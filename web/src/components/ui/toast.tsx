interface Props {
  message: string | null;
}

/** Aviso flotante breve (ej: "Enlace copiado"). */
export function Toast({ message }: Props) {
  if (!message) return null;
  return (
    <div className="fixed bottom-6 inset-x-0 z-50 flex justify-center px-8 pointer-events-none">
      <p className="text-white text-xs font-medium text-center leading-snug drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]">
        {message}
      </p>
    </div>
  );
}
