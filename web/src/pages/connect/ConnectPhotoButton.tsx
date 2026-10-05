import { Camera } from 'lucide-react';

/** Control compartido para subir fotos: el selector nativo permanece oculto. */
export default function ConnectPhotoButton({label,onClick,disabled=false,compact=false}:{label:string;onClick:()=>void;disabled?:boolean;compact?:boolean}) {
 return <button type="button" className={`connect-photo-button${compact?' is-compact':''}`} onClick={onClick} disabled={disabled} aria-label={label}><span className="connect-camera-symbol"><Camera size={32} strokeWidth={1.65}/><i/></span>{!compact&&<span>{label}</span>}</button>;
}
