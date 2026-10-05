import { BCV_RATE } from './data';

const usd = new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
const bs = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 0 });

export const formatUsd = (value: number) => usd.format(value).replace('US$', '$');
export const formatBs = (valueUsd: number) => `Bs ${bs.format(valueUsd * BCV_RATE)}`;
export const formatHour = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
