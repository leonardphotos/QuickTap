import type { SVGProps } from 'react';

/** Iconos monocromáticos simples para redes sociales, usados en el banner del menú público. */

export function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FacebookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M14 21v-8h2.7l.4-3.2H14V7.7c0-.9.3-1.6 1.6-1.6H17V3.2C16.7 3.1 15.7 3 14.6 3 12.2 3 10.5 4.5 10.5 7.3v2.5H8V13h2.5v8H14z" />
    </svg>
  );
}

export function TikTokIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M16.2 3h-2.8v12.4a2.9 2.9 0 1 1-2.1-2.8V9.5a5.9 5.9 0 1 0 5 5.8V9.1a7.6 7.6 0 0 0 4.4 1.4V7.6a4.8 4.8 0 0 1-4.5-4.6z" />
    </svg>
  );
}

export function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M4 3h3.6l4 5.4L16.4 3H20l-6.2 7.9L20.3 21h-3.6l-4.3-5.8L7.5 21H4l6.6-8.3z" />
    </svg>
  );
}

export function WhatsAppIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 2.5A9.5 9.5 0 0 0 3.9 17.3L2.5 21.5l4.3-1.4A9.5 9.5 0 1 0 12 2.5Zm0 1.8a7.7 7.7 0 1 1 0 15.4 7.6 7.6 0 0 1-3.9-1.1l-.3-.2-2.5.8.8-2.4-.2-.3A7.7 7.7 0 0 1 12 4.3Zm-3.1 3.6c-.2 0-.5 0-.7.3-.3.3-.9.9-.9 2.1s1 2.5 1.1 2.6c.1.2 1.9 3 4.7 4.1 2.3.9 2.8.7 3.3.7.5-.1 1.6-.7 1.8-1.3.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.6-.4-.3-.1-1.6-.8-1.9-.9-.2-.1-.4-.1-.6.1-.2.3-.7.9-.8 1-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.5-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.2-.5.1-.2 0-.4 0-.5-.1-.1-.6-1.5-.8-2-.2-.5-.4-.4-.6-.5h-.5Z" />
    </svg>
  );
}
