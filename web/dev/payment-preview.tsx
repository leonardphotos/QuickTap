import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import SubscriptionCheckout from '../src/components/billing/SubscriptionCheckout';
import '../src/index.css';
function Preview(){const [version,setVersion]=useState(0);return <SubscriptionCheckout key={version} preview planName="Operations" periodLabel="Suscripción mensual" totalLabel="€39,99" restaurantName="Casa Oliva" accounts={{pagoMovil:{banco:'Banco de ejemplo',telefono:'0412-0000000',cedula:'J-00000000-0',titular:'Cuenta de demostración'},binance:{id:'ID de demostración',correo:'pagos@example.invalid'},bankTransfer:{banco:'Banco de ejemplo',cuenta:'0000 0000 00 0000000000',titular:'Cuenta de demostración',rif:'J-00000000-0'}}} methods={[{id:'PAGO_MOVIL',amountLabel:'Bs. 3.999,00',rateLabel:'Tasa de ejemplo: 1 EUR = Bs. 100,00'},{id:'BINANCE',amountLabel:'43,99 USDT',rateLabel:'Equivalencia ilustrativa · No es una cotización'},{id:'BANK_TRANSFER',amountLabel:'Bs. 3.999,00',rateLabel:'Tasa de ejemplo: 1 EUR = Bs. 100,00'}]} onBack={()=>setVersion(v=>v+1)} onSubmit={async()=>{await new Promise(r=>setTimeout(r,600))}}/>}
createRoot(document.getElementById('root')!).render(<Preview/>);
