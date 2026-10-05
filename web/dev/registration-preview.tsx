// Simulación local sin cuentas, cobros ni solicitudes al backend.
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import RegistrationFlow, { type RegistrationFields } from '../src/components/billing/RegistrationFlow';
import { type CommercialPlan } from '../src/utils/commercial-plans';
import '../src/index.css';
function Preview() {
  const [values, setValues] = useState<RegistrationFields>({restaurantName:'',slug:'',whatsappPhone:'',baseCurrency:'USD',ownerName:'',email:'',password:''});
  const [plan,setPlan] = useState<CommercialPlan>('ESSENTIAL');
  const [google,setGoogle] = useState<{googleName:string;googleEmail:string}|null>(null);
  const [busy,setBusy] = useState(false),[done,setDone] = useState(false),[error,setError] = useState<string|null>(null);
  const [simulateError,setSimulateError] = useState(false);
  return <BrowserRouter><div style={{padding:10,textAlign:'center',fontSize:12,background:'#fff3d8'}}>Vista previa · No crea cuentas ni realiza pagos. <label><input type="checkbox" checked={simulateError} onChange={e=>setSimulateError(e.target.checked)}/> Simular error al enviar</label></div>{done ? <main style={{padding:40,textAlign:'center'}}><h1>Registro simulado completado</h1><p>Plan elegido: {plan} · Ciclo: MONTHLY</p><p>En el registro real, la cuenta entra a la pasarela de este plan.</p><a href="/dev/payment.html">Ver simulación de la pasarela</a></main> : <RegistrationFlow values={values} onChange={(key,value)=>{setValues(v=>({...v,[key]:value}));setError(null)}} plan={plan} onPlanChange={setPlan} google={google} onClearGoogle={()=>setGoogle(null)} googleButton={<button type="button" onClick={()=>setGoogle({googleName:'Dueño Demo',googleEmail:'demo@example.com'})}>Simular Continuar con Google</button>} loading={busy} error={error} onSubmit={async()=>{setBusy(true);await new Promise(resolve=>setTimeout(resolve,500));setBusy(false);if(simulateError)setError('Ese enlace ya está en uso. Prueba con otro.');else setDone(true)}}/>}</BrowserRouter>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
