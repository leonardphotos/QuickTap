/** Solo presentación de comandas: conserva la dirección original para Maps y WhatsApp.
 * Mantener equivalente a comandaAddressText en print-station/index.html.
 */
export function comandaAddressText(address: string | null | undefined): string {
  return (address ?? '')
    .replace(/(?:https?:\/\/|www\.|(?:maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.[a-z.]+)\/)[^\s<>]+/gi, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}
