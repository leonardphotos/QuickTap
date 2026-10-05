/** Replica trialPeriodEnd y el ciclo MONTHLY de subscription.ts: 15 días + períodos de 30 días. */
export function registrationPaymentDates(registeredAt: Date) {
  const addDays = (days: number) => new Date(registeredAt.getTime() + days * 86400000);
  return { start: new Date(registeredAt), first: addDays(15), second: addDays(45), third: addDays(75) };
}
export function registrationDateLabel(date: Date) {
  return new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Caracas' }).format(date);
}
