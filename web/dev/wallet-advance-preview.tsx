import {createRoot} from 'react-dom/client';
import {AbonarDialog} from '../src/pages/wallet/AbonarDialog';
import '../src/index.css';
createRoot(document.getElementById('root')!).render(<AbonarDialog compraId="demo-sale" negocio="Negocio de prueba" saldo={60} cuotas={[1,2,3].map(n=>({id:`c${n}`,number:n,saldo:20,estado:'PENDIENTE'}))} rateBs={100} onClose={()=>{}} onListo={()=>{document.body.dataset.reported='true';}}/>);
