interface Props {
  message: string | null;
}

/** Aviso flotante breve (ej: "Enlace copiado"). */
export function Toast({ message }: Props) {
  if (!message) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-brand-950 text-white text-sm font-medium px-4 py-2.5 rounded-full shadow-lg">
      {message}
    </div>
  );
}
