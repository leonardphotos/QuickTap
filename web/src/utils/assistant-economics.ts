/** Proyección editable, nunca una conversión de saldo certificada por Google. */
export function projectAssistantEconomics(balanceMicros: number, inputTokens: number, outputTokens: number, creditsPerTask: number, confirmationPercent: number, inputRate = .75, outputRate = 3.75) {
  const values = [balanceMicros, inputTokens, outputTokens, creditsPerTask, confirmationPercent];
  if (values.some(v => !Number.isFinite(v)) || balanceMicros < 0 || inputTokens < 0 || outputTokens < 0 || creditsPerTask <= 0 || confirmationPercent <= 0 || confirmationPercent > 100) return null;
  if (![balanceMicros, inputTokens, outputTokens, creditsPerTask].every(Number.isSafeInteger) || inputTokens > 1000000 || outputTokens > 12000 || creditsPerTask > 10000) return null;
  const costPerCallMicros = Math.ceil(inputTokens * inputRate + outputTokens * outputRate);
  if (costPerCallMicros <= 0) return null;
  const calls = Math.floor(balanceMicros / costPerCallMicros);
  const tasks = Math.floor(calls * confirmationPercent / 100);
  const credits = tasks * creditsPerTask;
  const costPerCreditMicros = costPerCallMicros / (creditsPerTask * confirmationPercent / 100);
  return { calls, tasks, credits, costPerCreditMicros, costPer150Micros: costPerCreditMicros * 150, retailValueUsd: credits * 5 / 150 };
}
