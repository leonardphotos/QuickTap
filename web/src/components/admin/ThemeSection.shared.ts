import type { RestaurantTheme } from '@/types';


export const THEME_DEFAULTS: Required<Pick<RestaurantTheme, 'primary' | 'buttonText' | 'accent' | 'text' | 'bannerColor' | 'backgroundColor'>> = {
  primary: '#056CF2',
  buttonText: '#FFFFFF',
  accent: '#0597F2',
  text: '#001B43',
  bannerColor: '#0597F2',
  backgroundColor: '#FFFFFF',
};
