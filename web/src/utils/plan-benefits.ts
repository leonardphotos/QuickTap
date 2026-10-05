/** Expande «Todo Esencial/Operación» sin inventar beneficios de contratos personalizados. */
export interface BenefitPlan { name: string; features?: string[]; capacity?: string }
export function planBenefits(planName: string, plans: BenefitPlan[]): string[] {
  const visited = new Set<string>();
  function expand(name: string): string[] {
    if (visited.has(name)) return [];
    visited.add(name);
    const plan = plans.find(p => p.name === name);
    if (!plan) return [];
    return (plan.features ?? []).flatMap(feature => {
      const inherited = /^Todo (.+)$/.exec(feature);
      if (!inherited) return [feature];
      return plans.some(p => p.name === inherited[1]) ? expand(inherited[1]) : [feature];
    });
  }
  return [...new Set(expand(planName))];
}
