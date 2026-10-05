/** Orientación local; no envía ni almacena contraseñas y no cambia la política del servidor. */
export function passwordStrength(password: string): { level: number; label: string } {
  if (!password) return { level: 0, label: 'Sin evaluar' };
  const common = /^(password|contrase[ñn]a|quicktap|qwerty|123456|abcdef|admin|welcome|letmein)/i.test(password);
  const repeated = /^(.)\1+$/.test(password) || new Set(password).size < 4;
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter(rule => rule.test(password)).length;
  const level = common || repeated || password.length < 8 ? 1
    : password.length >= 14 && variety >= 2 ? 3 : password.length >= 10 ? 2 : 1;
  return { level, label: ['', 'Baja', 'Media', 'Alta'][level] };
}
export function passwordsMatch(password: string, confirmation: string): boolean {
  return password.length > 0 && password === confirmation;
}
