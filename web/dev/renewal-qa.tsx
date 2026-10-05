import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {AuthContext,type AuthState} from '../src/context/AuthContext.shared';
import Billing from '../src/pages/admin/BillingPage';
import '../src/index.css';
const context={user:{name:'Alex',email:'alex@example.invalid'},restaurant:{subscriptionPlan:'OPERATIONS',subscriptionStatus:'ACTIVE',billingCycle:'MONTHLY'},refresh:async()=>{}} as AuthState;
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={['/admin/billing?renew=1']}><AuthContext.Provider value={context}><Billing/></AuthContext.Provider></MemoryRouter>);
