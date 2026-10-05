/** Abono implícito solo cuando se recibió efectivo y no se indicó una fracción. */
export function cashPaymentAmount(amount: string, amountInBase: number, isCash: boolean, received: number, balance: number, tip: number) {
  if (amount.trim() || !isCash || !Number.isFinite(received) || received <= 0) return amountInBase;
  return Math.round(Math.max(0, Math.min(balance, received - tip)) * 100) / 100;
}
