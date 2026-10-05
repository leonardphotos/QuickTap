import { Globe, Link } from 'lucide-react';
import { InstagramIcon, FacebookIcon, TikTokIcon, XIcon, WhatsAppIcon } from '../../components/ui/social-icons';
const existing={Instagram:InstagramIcon,Facebook:FacebookIcon,TikTok:TikTokIcon,X:XIcon,WhatsApp:WhatsAppIcon};
/** SVG locales: no se envían las direcciones del perfil a servicios de favicons. */
export default function ConnectSocialIcon({platform,size=20}:{platform:string;size?:number}) {
 const Icon=existing[platform as keyof typeof existing];if(Icon)return <Icon width={size} height={size} aria-hidden="true"/>;
 const paths:Record<string,React.ReactNode>={
 YouTube:<><rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 6 3-6 3Z" fill="var(--social-cutout,#fff)"/></>,
 LinkedIn:<><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M6 10v8m0-12v.1m5 11.9v-8m0 4c0-5 6-5 6 0v4" fill="none" stroke="var(--social-cutout,#fff)" strokeWidth="2.3"/></>,
 Telegram:<path d="m2 11 19-8-4 18-6-5-3 3v-6l10-7-12 6Z"/>,
 Pinterest:<><circle cx="12" cy="12" r="10"/><path d="m9 21 3-12m-1 6c8 4 9-11 1-10-6 0-7 8-3 9" fill="none" stroke="var(--social-cutout,#fff)" strokeWidth="2"/></>,
 Twitch:<><path d="M4 2h18v14l-6 6h-5v-4H4Z"/><path d="M9 5h10v9l-4 4v-4H9Z" fill="var(--social-cutout,#fff)"/><path d="M12 7v5m4-5v5" stroke="currentColor" strokeWidth="2"/></>,
 Spotify:<><circle cx="12" cy="12" r="10"/><path d="M6 8c5-2 9-1 12 1M7 12c4-2 7-1 10 1M8 16c3-1 5-1 8 1" fill="none" stroke="var(--social-cutout,#fff)" strokeWidth="1.7" strokeLinecap="round"/></>,
 Discord:<><path d="m5 5 4-1 1 2h4l1-2 4 1c3 5 4 9 3 13l-5 2-2-3H9l-2 3-5-2c-1-4 0-8 3-13Z"/><ellipse cx="8" cy="12" rx="1.8" ry="2.2" fill="var(--social-cutout,#fff)"/><ellipse cx="16" cy="12" rx="1.8" ry="2.2" fill="var(--social-cutout,#fff)"/></>,
 Snapchat:<path d="M12 2c-5 0-5 5-4 8l-3-1-1 2 3 2c-1 3-3 4-5 4l3 2 3 1c3 3 5 3 8 0l3-1 3-2c-2 0-4-1-5-4l3-2-1-2-3 1c1-3 1-8-4-8Z"/>,
 Threads:<path d="M19 7C17 1 6 1 4 8c-3 10 4 16 11 13 8-3 5-13-3-12-5 0-5 7 0 7 6 0 5-11-2-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>,
 };
 if(!paths[platform])return platform==='Sitio web'?<Globe size={size} aria-hidden="true"/>:<Link size={size} aria-hidden="true"/>;
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{paths[platform]}</svg>;
}
