import { createRoot } from 'react-dom/client';
import { MasterAuthContext } from '../src/context/MasterAuthContext.shared';
import { masterApi } from '../src/api/client';
import MasterAssistantPage from '../src/pages/master/MasterAssistantPage';
import '../src/index.css';
if (!import.meta.env.DEV) throw new Error('Solo desarrollo');
masterApi.defaults.adapter = async config => {
  if (config.method !== 'get') throw Object.assign(new Error('Solo demo'), {response:{data:{error:'Vista previa: no se guardan cambios ni se acreditan créditos.'}}});
  const data = config.url?.endsWith('/control') ? {provider:{rates:{inputPerMillion:.75,outputPerMillion:3.75},enabled:false,keyConfigured:false,model:'gemini-3.8-flash',monthlyLimitMicros:0,referenceBalanceMicros:1170000,balanceUpdatedAt:null,spentMicros:0,heldMicros:0,availableMicros:1170000,unresolvedCalls:0,economics:{chargedCredits:0,settledCostMicros:0},tokens:{_count:0,_sum:{inputTokens:0,outputTokens:0}}},restaurants:[{id:'demo',name:'Restaurante de ejemplo',assistantWallet:null}],entries:[]} : [];
  return { data:{data},status:200,statusText:'OK',headers:{},config };
};
createRoot(document.getElementById('root')!).render(<MasterAuthContext.Provider value={{admin:{id:'demo',name:'Demo',email:'demo@example.invalid',role:'ADMIN'},loading:false,login:async()=>{},logout:()=>{}}}><div style={{padding:24,background:'#f6f8fb',minHeight:'100vh'}}><p style={{textAlign:'center'}}>Demostración · No se guardan cambios</p><MasterAssistantPage /></div></MasterAuthContext.Provider>);
