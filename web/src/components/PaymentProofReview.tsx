import {useEffect,useState} from 'react';
import {api,masterApi} from '@/api/client';
type Review={status:string;message:string;signals:string[];visual?:{amount:string|null;currency:string|null;reference:string|null;bank:string|null;date:string|null}};
export default function PaymentProofReview({fileKey,master=false}:{fileKey:string;master?:boolean}){
 const [review,setReview]=useState<Review|null>(null),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;setLoading(true);setReview(null);(master?masterApi:api).get(master?'/master/plan-requests/proof-analysis':'/orders/proof-analysis',{params:{fileKey}}).then(r=>{if(active)setReview(r.data.data)}).catch(()=>{}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[fileKey,master]);
 return <div className="my-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950" role="status"><strong>Revisión del comprobante</strong><p>{loading?'Consultando revisión…':review?.message||'Sin análisis automático disponible. Requiere revisión manual.'}</p>{review?.visual&&<p>{[review.visual.bank,review.visual.amount&&`${review.visual.amount} ${review.visual.currency||''}`,review.visual.reference&&`Ref. ${review.visual.reference}`,review.visual.date].filter(Boolean).join(' · ')}</p>}{review?.signals.map((s,i)=><p key={i}>• {s}</p>)}<p className="mt-2 text-base">Esto no confirma que el dinero llegó ni certifica que la imagen sea auténtica. Verifica el movimiento en el banco. La edición o el uso de IA pueden pasar inadvertidos.</p></div>;
}
