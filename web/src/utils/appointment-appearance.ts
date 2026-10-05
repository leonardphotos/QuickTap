import type { CSSProperties } from 'react';

export const appointmentColors = {
  surface: ['Tarjetas', '#ffffff'], text: ['Títulos y precios', '#202320'],
  muted: ['Textos secundarios', '#747871'], border: ['Bordes', '#ebede7'],
  soft: ['Iconos y resúmenes · fondo', '#f1f3ee'], icon: ['Iconos', '#4e5748'],
  buttonText: ['Texto de botones y paso activo', '#ffffff'],
  field: ['Campos · fondo', '#f7f8f4'], fieldText: ['Campos · texto', '#262d22'],
  coverText: ['Texto sobre portada', '#ffffff'], hover: ['Tarjetas al pasar el cursor', '#fdfefa'],
  successBackground: ['Confirmación · fondo', '#f0f4e9'], successText: ['Confirmación · icono', '#546a3a'],
  errorBackground: ['Errores · fondo', '#fff0ed'], errorText: ['Errores · texto', '#a44235'],
} as const;
export type AppointmentPalette = Partial<Record<keyof typeof appointmentColors, string>>;
export type AppearanceSettings = { primaryColor?: unknown; backgroundColor?: unknown; accentColor?: unknown; appearance?: unknown };
const hex = (value: unknown, fallback: string) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
export function resolveAppointmentPalette(settings: AppearanceSettings) {
  const raw = settings.appearance && typeof settings.appearance === 'object' ? settings.appearance as AppointmentPalette : {};
  const result = Object.fromEntries(Object.entries(appointmentColors).map(([key, [, fallback]]) => [key, hex(raw[key as keyof AppointmentPalette], fallback)])) as Required<AppointmentPalette>;
  if (!raw.buttonText) {
    const primary = hex(settings.primaryColor, '#008edf').slice(1);
    const rgb = [0,2,4].map(i => parseInt(primary.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
    result.buttonText = rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722 < .18 ? '#ffffff' : '#082241';
  }
  return result;
}
export function appointmentAppearanceStyle(settings: AppearanceSettings): CSSProperties {
  const palette = resolveAppointmentPalette(settings);
  return {
    '--booking-primary': hex(settings.primaryColor, '#008edf'),
    '--booking-bg': hex(settings.backgroundColor, '#f8fafc'),
    '--booking-accent': hex(settings.accentColor, '#0f172a'),
    ...Object.fromEntries(Object.entries(palette).map(([key, value]) => [`--booking-${key}`, value])),
    '--booking-ink': palette.text, '--booking-on-primary': palette.buttonText,
  } as CSSProperties;
}
