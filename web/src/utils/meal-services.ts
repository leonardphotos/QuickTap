/**
 * Turnos de servicio para filtrar las reservas del día ("muéstrame solo la cena").
 *
 * A propósito NO está en la base de datos: es un filtro sobre `Reservation.time`, que es un
 * string "HH:mm" y por eso se puede comparar tal cual. Si algún día un restaurante necesita sus
 * propios rangos, esto pasa a una columna del restaurante sin cambiar cómo se usa acá.
 */

export interface MealService {
  id: string;
  label: string;
  /** Inclusive, formato "HH:mm". */
  from: string;
  /** Exclusivo, formato "HH:mm". */
  to: string;
}

export const MEAL_SERVICES: MealService[] = [
  { id: 'desayuno', label: 'Desayuno', from: '06:00', to: '11:30' },
  { id: 'almuerzo', label: 'Almuerzo', from: '11:30', to: '17:00' },
  { id: 'cena', label: 'Cena', from: '17:00', to: '23:59' },
];

/** El turno al que pertenece una hora "HH:mm". null si cae fuera de todos (madrugada). */
export function mealServiceOf(time: string): MealService | null {
  return MEAL_SERVICES.find((s) => time >= s.from && time < s.to) ?? null;
}

/** El turno que corresponde a una hora del día, para arrancar la pantalla en el turno en curso. */
export function currentMealServiceId(now: Date): string {
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return mealServiceOf(hhmm)?.id ?? MEAL_SERVICES[MEAL_SERVICES.length - 1].id;
}
