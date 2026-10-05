/** Destino interno acotado: nunca aceptar una URL arbitraria en el retorno del login. */
export function billingReturn(search:string) {
  const params=new URLSearchParams(search);
  const renewal=params.get('renew')==='1'||params.get('next')==='renew';
  const raw=params.get('local')??'';
  const slug=/^[a-z0-9-]{1,100}$/.test(raw)?raw:undefined;
  const suffix=slug?`&local=${encodeURIComponent(slug)}`:'';
  return {renewal,slug,paymentPath:renewal?`/admin/billing?renew=1${suffix}`:'/admin',loginPath:renewal?`/admin/login?next=renew${suffix}`:'/admin/login'};
}
