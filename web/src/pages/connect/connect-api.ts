export const CONNECT_TOKEN = 'quicktap_connect_token';
export const platforms = ['Instagram','TikTok','WhatsApp','Facebook','YouTube','X','LinkedIn','Threads','Telegram','Pinterest','Twitch','Snapchat','Spotify','Discord','Sitio web','Otro'];
export interface SocialLink { display?:'icon'|'button'; platform:string; label:string; url:string }
export interface ConnectProfile { upgradedRestaurant?:{slug:string;name:string}|null;upgradePlan?:string|null; menuCatalog?:FreeMenuCatalog|null;menuImages?:{productId:string;updatedAt:string}[]; occupation?:string; photos:{slot:number;caption:string;updatedAt:string}[]; handle:string; displayName:string; bio:string; links:SocialLink[]; theme:{background:string;text:string;button:string;buttonText:string}; updatedAt:string; published?:boolean; verifiedAt?:string|null; email?:string; publicUrl?:string }
export async function connectApi<T>(path:string,method='GET',body?:unknown):Promise<T> {
 const token=localStorage.getItem(CONNECT_TOKEN);
 const form=body instanceof FormData;
 const res=await fetch(`/api/v1/connect${path}`,{method,credentials:'omit',headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(!form&&body?{'Content-Type':'application/json'}:{})},body:body?(form?body:JSON.stringify(body)):undefined});
 const data=await res.json();
 if(!res.ok){if(res.status===401){localStorage.removeItem(CONNECT_TOKEN);}const details=data.details?.fieldErrors;throw new Error(details?Object.values(details).flat().join(' '):data.error||'No pudimos completar la solicitud.');}
 return data.data as T;
}
export function subdomainHandle(hostname:string) {
 const match=hostname.toLowerCase().match(/^([a-z][a-z0-9-]{2,29})\.quicktap\.club$/);
 return match&&!['www','api','admin','master','mail','server2','connect','wallet','cdn','assets','uploads','status','staging','dev','webmail'].includes(match[1])?match[1]:null;
}
export interface FreeMenuCategory {id:string;name:string}
export interface FreeMenuProduct {id:string;categoryId:string;name:string;description:string;priceCents:number;available:boolean}
export interface FreeMenuCatalog {whatsapp:string;categories:FreeMenuCategory[];products:FreeMenuProduct[]}
export const emptyMenu:FreeMenuCatalog={whatsapp:'',categories:[],products:[]};
