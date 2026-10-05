import type { ConnectProfile } from './connect-api';
type Theme=ConnectProfile['theme'];
const presets=[
 {name:'Noche',background:'#18191e',text:'#ffffff',button:'#ffffff',buttonText:'#18191e'},
 {name:'Claro',background:'#f5f5f7',text:'#1d1d1f',button:'#1d1d1f',buttonText:'#ffffff'},
 {name:'Salvia',background:'#e8ede6',text:'#243729',button:'#375441',buttonText:'#ffffff'},
 {name:'Rosa',background:'#f9eeee',text:'#462b35',button:'#734453',buttonText:'#ffffff'},
 {name:'Océano',background:'#eaf2fa',text:'#17324d',button:'#245580',buttonText:'#ffffff'},
 {name:'Lavanda',background:'#f0ecfa',text:'#3d2b59',button:'#654489',buttonText:'#ffffff'},
 {name:'Arena',background:'#f5efe5',text:'#493725',button:'#72543b',buttonText:'#ffffff'},
 {name:'Terracota',background:'#faeee7',text:'#572f24',button:'#984c35',buttonText:'#ffffff'},
 {name:'Bosque',background:'#162c25',text:'#edf7ef',button:'#c5e1c5',buttonText:'#193326'},
 {name:'Zafiro',background:'#17243f',text:'#edf3ff',button:'#b9d0ff',buttonText:'#17243f'},
 {name:'Borgoña',background:'#361e2d',text:'#fff0f5',button:'#efbfd1',buttonText:'#361e2d'},
 {name:'Ámbar',background:'#2d261a',text:'#fff4df',button:'#edca86',buttonText:'#382a12'},
];
export default function ConnectAppearance({theme,onChange}:{theme:Theme;onChange:(theme:Theme)=>void}) {
 return <section className="connect-appearance" aria-label="Colores del perfil"><div className="connect-appearance-heading"><h2>Dale tu estilo.</h2><p>Elige una combinación o crea la tuya.</p></div><div className="connect-palette-presets">{presets.map(({name,...preset})=>{const active=Object.keys(preset).every(key=>preset[key as keyof Theme]===theme[key as keyof Theme]);return <button type="button" key={name} aria-pressed={active} aria-label={`Tema ${name}`} onClick={()=>onChange(preset)}><span className="connect-palette-sample" style={{background:preset.background}}><i style={{background:preset.text}}/><i style={{background:preset.button}}/></span><span>{name}</span></button>})}</div><div className="connect-color-controls">{([['background','Fondo del panel'],['text','Texto'],['button','Botones'],['buttonText','Texto de botones']] as const).map(([key,label])=><label key={key}><span>{label}</span><span className="connect-swatch"><input type="color" aria-label={label} value={theme[key]} onChange={e=>onChange({...theme,[key]:e.target.value})}/></span></label>)}</div><p className="connect-color-hint text-xs">Los colores cambian al instante en tu vista previa.</p></section>;
}
