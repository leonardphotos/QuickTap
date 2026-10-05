

export function DownloadDato({ etiqueta, valor, capitalize }: { etiqueta: string; valor: string; capitalize?: boolean }) {
  return (
    <div>
      <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#a1a1aa' }}>
        {etiqueta}
      </p>
      <p className={`mt-0.5 text-[13.5px] font-semibold leading-snug ${capitalize ? 'capitalize' : ''}`}>{valor}</p>
    </div>
  );
}
