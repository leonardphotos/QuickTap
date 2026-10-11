import { lineCharges } from './order-line-tax';
import { ORDER_CORRECTION_ROLES } from '../../utils/roles';
import { PaymentMethod, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { badRequest, conflict, forbidden, notFound } from '../../utils/http-error';
import { baseToBs, round2, toDecimal } from '../../utils/money';
import { paymentChangeParts } from '../../utils/payment-change';
import { bankLedgerService } from '../bank-accounts/bank-ledger.service';
import { correctionBalance } from './order-correction.balance';
import { adjustCorrectionStock } from './order-correction.stock';

const method=z.nativeEnum(PaymentMethod).refine(m=>m!=='PAYROLL_DEDUCTION','El descuento de nómina no es un movimiento de dinero.');
const base={requestKey:z.string().uuid(),reason:z.string().trim().min(3,'Escribe un motivo del cambio.').max(500),version:z.string().datetime()};
const money={method,amountBase:z.number().positive().max(1000000).refine(n=>Math.abs(n*100-Math.round(n*100))<1e-7,'Usa máximo dos decimales.'),referenceNumber:z.string().trim().max(120).optional(),bankAccountId:z.string().min(1).optional()};
export const correctionSchema=z.discriminatedUnion('action',[
 z.object({...base,action:z.literal('PAYMENT'),amountBase:money.amountBase.optional(),settleBalance:z.boolean().optional(),changeTreatment:z.enum(['KEEP','REVERSE']).optional(),paymentId:z.string().min(1),method,referenceNumber:z.string().trim().max(120).optional(),bankAccountId:z.string().min(1).optional()}).strict(),
 z.object({...base,action:z.literal('PAYMENT_PREFERENCE'),method}).strict(),
 z.object({...base,action:z.literal('ITEMS'),items:z.array(z.object({id:z.string().min(1),quantity:z.number().int().min(0).max(999),note:z.string().max(200).optional()}).strict()).min(1).max(200),inventory:z.enum(['ADJUST','KEEP'])}).strict(),
 z.object({...base,action:z.literal('VOID'),inventory:z.enum(['ADJUST','KEEP'])}).strict(),
 z.object({...base,...money,action:z.literal('COLLECT')}).strict(),
 z.object({...base,...money,action:z.literal('REFUND')}).strict(),
]);
type Input=z.infer<typeof correctionSchema>;
const include={items:{include:{modifiers:true}},payments:{orderBy:{createdAt:'asc' as const}},refunds:true};
const json=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

async function load(tx:Prisma.TransactionClient,restaurantId:string,id:string) {
 const order=await tx.order.findFirst({where:{id,restaurantId},include});
 if(!order) throw notFound('Pedido no encontrado.');
 return order;
}
async function fiscalGuard(tx:Prisma.TransactionClient,order:Awaited<ReturnType<typeof load>>) {
 if(order.fiscalPrintedAt||order.fiscalPrinterInvoice||order.wantsFiscalInvoice||await tx.fiscalInvoice.count({where:{restaurantId:order.restaurantId,orderId:order.id}})) throw conflict('Este pedido tiene un documento fiscal emitido o solicitado. No admite correcciones administrativas.');
}
async function account(tx:Prisma.TransactionClient,restaurantId:string,method:PaymentMethod,id?:string) {
 const accounts=await tx.bankAccount.findMany({where:{restaurantId,paymentMethods:{has:method},...(id?{id}:{})}});
 if(id&&!accounts.length) throw badRequest('La cuenta no pertenece al negocio o no está vinculada al método.');
 if(accounts.length>1) throw badRequest('Selecciona la cuenta bancaria para este movimiento.');
 return accounts[0]?.id;
}

export const orderCorrectionService={
 async detail(restaurantId:string,id:string) {
  const order=await load(prisma,restaurantId,id);
  const fiscal=Boolean(order.fiscalPrintedAt||order.fiscalPrinterInvoice||order.wantsFiscalInvoice||await prisma.fiscalInvoice.count({where:{restaurantId,orderId:id}}));
  const logs=await prisma.orderCorrection.findMany({where:{restaurantId,orderId:id},orderBy:{createdAt:'desc'},take:100});
  const accounts=await prisma.bankAccount.findMany({where:{restaurantId},select:{id:true,name:true,paymentMethods:true}});
  return {order,balance:correctionBalance(order),fiscal,logs,accounts};
 },
 async apply(restaurantId:string,id:string,actorId:string,input:Input) {
  return prisma.$transaction(async tx=>{
   const actor=await tx.user.findFirst({where:{id:actorId,restaurantId,isActive:true,role:{in:[...ORDER_CORRECTION_ROLES]}}});
   if(!actor) throw forbidden('Solo el dueño, administrador o cajero puede corregir pedidos.');
   const tenant=await tx.restaurant.findUnique({where:{id:restaurantId},select:{businessType:true}});
   if(tenant?.businessType!=='RESTAURANT') throw forbidden('Esta corrección corresponde al módulo de restaurantes.');
   const [{locked}]=await tx.$queryRaw<{locked:boolean}[]>`SELECT pg_try_advisory_xact_lock(hashtext(${'order-payment:'+id})) AS locked`;
   if(!locked) throw conflict('El pedido está siendo actualizado. Intenta nuevamente.');
   const repeated=await tx.orderCorrection.findUnique({where:{requestKey:input.requestKey}});
   if(repeated) {
    if(repeated.restaurantId!==restaurantId||repeated.orderId!==id) throw conflict('La operación ya fue utilizada.');
    return {balance:correctionBalance(await load(tx,restaurantId,id)),repeated:true};
   }
   await tx.$queryRaw`SELECT id FROM orders WHERE id=${id} AND "restaurantId"=${restaurantId} FOR UPDATE`;
   const order=await load(tx,restaurantId,id);
   await tx.$executeRaw`SELECT set_config('app.order_correction',${id},true)`;
   const liveDelivery=['DELIVERY','PICKUP'].includes(order.channel)&&!order.deliveryFinalizedAt&&!order.adminCorrectedAt&&order.status!=='CANCELLED';
   const livePayment=liveDelivery&&['PAYMENT','PAYMENT_PREFERENCE'].includes(input.action);
   if(input.action==='PAYMENT_PREFERENCE'&&!liveDelivery) throw badRequest('El método previsto solo se cambia en delivery o pickup abiertos.');
   if(input.action==='PAYMENT'&&input.settleBalance&&!liveDelivery) throw badRequest('Solo puedes incluir el saldo de un delivery o pickup abierto.');
   await fiscalGuard(tx,order);
   if(order.updatedAt.toISOString()!==input.version) throw conflict('El pedido cambió. Cierra y vuelve a abrir la corrección para revisar la versión actual.');
   if(!livePayment&&!order.adminCorrectedAt&&order.status!=='SERVED'&&Number(correctionBalance(order).pendingCollectionBase)>0.01) throw badRequest('La cuenta todavía está pendiente de pago. Usa la edición normal del pedido.');
   if(order.payments.some(p=>p.method==='PAYROLL_DEDUCTION')||order.isPartnerConsumption||order.isEmployeeConsumption) throw badRequest('Los consumos internos requieren su ajuste de nómina o socios, no una corrección de cobros.');
   if(order.status==='CANCELLED'&&input.action!=='REFUND') throw conflict('Un pedido anulado solo permite registrar su devolución pendiente.');
   const before=json(order);
   const now=new Date();
   if(input.action==='PAYMENT_PREFERENCE') {
    await tx.order.update({where:{id},data:{paymentMethod:input.method}});
   } else if(input.action==='PAYMENT') {
    const payment=order.payments.find(p=>p.id===input.paymentId);
    if(!payment) throw notFound('Pago no encontrado en este pedido.');
    if(livePayment) {
     if(['MOBILE_PAYMENT','ZELLE','CARD','BINANCE','PAYPAL','TRANSFER'].includes(input.method)&&!input.referenceNumber?.trim()) throw badRequest('Indica la referencia del pago recibido.');
    }
    if (input.amountBase !== undefined && input.settleBalance) throw badRequest('Elige monto personalizado o incluir saldo pendiente, no ambos.');
    const correctedAmount = input.amountBase !== undefined ? toDecimal(input.amountBase) : payment.amountBase.add(input.settleBalance ? toDecimal(correctionBalance(order).pendingCollectionBase) : 0);
    const extra=correctedAmount.sub(payment.amountBase);
    const destination=await account(tx,restaurantId,input.method,input.bankAccountId);
    const parts=paymentChangeParts(payment);
    const reverseChange=livePayment&&input.changeTreatment==='REVERSE'&&parts.length>0;
    const oldGross=Boolean(Array.isArray(payment.changeParts)&&payment.changeParts.length)||parts.some(p=>p.method!==payment.method);
    const net=payment.amountBase.add(payment.tipBase??0);
    const gross=net.add(payment.changeBase??0);
    const moved=reverseChange||!extra.eq(0)||input.method!==payment.method||Boolean(input.bankAccountId&&destination!==payment.correctionBankAccountId);
    if(moved) {
     const credits=await tx.bankTransaction.findMany({where:{restaurantId,sourceRef:id,type:'CREDIT',paymentMethod:payment.method}});
     const sources=[...new Set(credits.map(p=>p.accountId))];
     const previousChange=livePayment?await tx.orderCorrection.findFirst({where:{restaurantId,orderId:id,action:'PAYMENT'},orderBy:{createdAt:'desc'}}):null;
     if(previousChange&&!payment.correctionBankAccountId&&sources.length) throw conflict('No se puede identificar con certeza la cuenta original después de una corrección anterior. Requiere conciliación administrativa.');
     const source=payment.correctionBankAccountId??(sources.length===1?sources[0]:undefined);
     if(!source&&sources.length>1) throw conflict('Este cobro histórico tiene varias cuentas posibles. No se puede reasignar sin identificar su asiento de origen.');
     if(source&&!await tx.bankAccount.findFirst({where:{id:source,restaurantId},select:{id:true}})) throw conflict('La cuenta original del cobro ya no existe. Requiere conciliación antes de cambiar el método.');
     if(source) await bankLedgerService.applyMethodPayment(tx,{restaurantId,method:payment.method,bankAccountId:source,direction:'DEBIT',amountBase:oldGross?gross:net,rateBs:order.exchangeRate,sourceRef:id,createdByUserId:actorId,description:`Corrección #${order.orderNumber}: reverso del método anterior`});
     await bankLedgerService.applyMethodPayment(tx,{restaurantId,method:input.method,bankAccountId:destination,direction:'CREDIT',amountBase:(reverseChange?net:gross).add(extra),rateBs:order.exchangeRate,sourceRef:id,createdByUserId:actorId,description:`Corrección #${order.orderNumber}: método correcto`});
     // En el formato antiguo el vuelto del mismo efectivo estaba neteado en el ingreso.
     // Al normalizarlo a partes explícitas, se registra esa salida una sola vez.
     if(!reverseChange&&!oldGross&&parts.length&&source) await bankLedgerService.applyMethodPayment(tx,{restaurantId,method:payment.method,bankAccountId:source,direction:'DEBIT',amountBase:payment.changeBase!,rateBs:order.exchangeRate,sourceRef:id,createdByUserId:actorId,description:`Corrección #${order.orderNumber}: conservar vuelto original`});
    }
    if(reverseChange&&oldGross) for(const part of parts) {
     const debits=await tx.bankTransaction.findMany({where:{restaurantId,sourceRef:id,type:'DEBIT',paymentMethod:part.method}});
     const accounts=[...new Set(debits.map(d=>d.accountId))];
     if(accounts.length>1) throw conflict('Selecciona la cuenta original del vuelto mediante conciliación: existen varias cuentas posibles.');
     if(accounts.length===1) await bankLedgerService.applyMethodPayment(tx,{restaurantId,method:part.method,bankAccountId:accounts[0],direction:'CREDIT',amountBase:toDecimal(part.amountBase),rateBs:order.exchangeRate,sourceRef:id,createdByUserId:actorId,description:`Corrección #${order.orderNumber}: anular vuelto registrado por error`});
    }
    await tx.orderPayment.update({where:{id:payment.id},data:{amountBase:payment.amountBase.add(extra),method:input.method,referenceNumber:input.referenceNumber??payment.referenceNumber,...((livePayment||input.amountBase!==undefined)?{proofImageUrl:null,amountReceivedBase:gross.add(extra)}:{}),...(moved?{correctionBankAccountId:destination??null}:{}), ...(reverseChange?{changeParts:Prisma.DbNull,changeBase:null,changeMethod:null,changeReferenceNumber:null,amountReceivedBase:net.add(extra)}:moved&&parts.length?{changeParts:json(parts),changeMethod:null,amountReceivedBase:gross.add(extra)}:{})}});
    if(livePayment||order.payments.length===1) await tx.order.update({where:{id},data:{paymentMethod:input.method}});
   } else if(input.action==='ITEMS'||input.action==='VOID') {
    if(input.action==='ITEMS'&&new Set(input.items.map(i=>i.id)).size!==input.items.length) throw badRequest('No repitas productos en la corrección.');
    if(input.action==='ITEMS'&&input.items.some(i=>!order.items.some(o=>o.id===i.id))) throw badRequest('Uno de los productos no pertenece al pedido.');
    const items=order.items.map(item=>{
     const change=input.action==='ITEMS'?input.items.find(i=>i.id===item.id):undefined;
     const quantity=input.action==='VOID'?0:change?.quantity??item.quantity;
     return {...item,quantity,note:change?.note??item.note,lineTotal:round2(item.unitPrice.mul(quantity)),paidQuantity:Math.min(item.paidQuantity,quantity)};
    });
    if(input.action==='ITEMS'&&!items.some(i=>i.quantity>0)) throw badRequest('Para quitar todos los productos utiliza Anular pedido.');
    if(input.inventory==='ADJUST'&&order.status==='SERVED') await adjustCorrectionStock(tx,restaurantId,order.channel,order.items,items);
    if(input.action==='ITEMS') for(const item of items) await tx.orderItem.update({where:{id:item.id},data:{quantity:item.quantity,note:item.note,lineTotal:item.lineTotal,paidQuantity:item.paidQuantity}});
    let subtotal=round2(items.reduce((n,i)=>n.add(i.lineTotal),toDecimal(0)));
    // Conserva las tasas originales y los cargos de envío/envases, no los ajustes actuales del local.
    const first=await tx.orderCorrection.findFirst({where:{restaurantId,orderId:id,action:'ITEMS'},orderBy:{createdAt:'asc'}});
    const baseline=first?.before as {subtotalBase:string;serviceChargeBase:string;ivaBase:string}|undefined;
    const baselineSubtotal=toDecimal(baseline?.subtotalBase??order.subtotalBase);
    const scale=baselineSubtotal.gt(0)?subtotal.div(baselineSubtotal):toDecimal(0);
    let service=round2(toDecimal(baseline?.serviceChargeBase??order.serviceChargeBase).mul(scale)),iva=round2(toDecimal(baseline?.ivaBase??order.ivaBase).mul(scale));
    if (items.some(item => item.vatMode)) {
      const taxConfig = await tx.restaurant.findUniqueOrThrow({where:{id:restaurantId}});
      const computed = lineCharges(items, taxConfig, order.channel, order.isPartnerConsumption || order.isEmployeeConsumption);
      subtotal = computed.subtotalBase; iva = computed.ivaBase;
      const oldGross = order.subtotalBase.add(order.ivaBase);
      service = oldGross.gt(0) ? round2(order.serviceChargeBase.mul(subtotal.add(iva)).div(oldGross)) : toDecimal(0);
    }
    const total=input.action==='VOID'?toDecimal(0):round2(subtotal.add(service).add(iva).add(order.deliveryFeeBase).add(order.envaseFeeBase));
    await tx.order.update({where:{id},data:input.action==='VOID'?{status:'CANCELLED',adminVoidedAt:now}:{subtotalBase:subtotal,serviceChargeBase:service,ivaBase:iva,totalBase:total,totalBs:baseToBs(total,order.exchangeRate),clearedAt:null}});
   } else {
    if(!order.adminCorrectedAt) throw badRequest('Primero registra una corrección del pedido.');
    const balance=correctionBalance(order), amount=toDecimal(input.amountBase);
    const limit=toDecimal(input.action==='COLLECT'?balance.pendingCollectionBase:balance.pendingRefundBase);
    if(amount.gt(limit)) throw badRequest(`El pendiente es ${limit.toFixed(2)} en la moneda del pedido.`);
    const bankAccountId=await account(tx,restaurantId,input.method,input.bankAccountId);
    if(input.action==='COLLECT') await tx.orderPayment.create({data:{orderId:id,amountBase:amount,method:input.method,referenceNumber:input.referenceNumber,correctionBankAccountId:bankAccountId}});
    else await tx.orderRefund.create({data:{requestKey:input.requestKey,restaurantId,orderId:id,amountBase:amount,amountBs:baseToBs(amount,order.exchangeRate),method:input.method,reason:input.reason,referenceNumber:input.referenceNumber,createdByUserId:actorId,createdByName:actor.name}});
    await bankLedgerService.applyMethodPayment(tx,{restaurantId,method:input.method,bankAccountId,direction:input.action==='COLLECT'?'CREDIT':'DEBIT',amountBase:amount,rateBs:order.exchangeRate,sourceRef:input.action==='REFUND'?input.requestKey:id,createdByUserId:actorId,description:`${input.action==='COLLECT'?'Cobro':'Devolución'} de diferencia #${order.orderNumber}: ${input.reason}`});
   }
   await tx.order.update({where:{id},data:livePayment?{updatedAt:now,...(input.action==='PAYMENT'&&input.settleBalance?{awaitingPayment:false}:{})}:{adminCorrectedAt:now}});
   const after=await load(tx,restaurantId,id);
   await tx.orderCorrection.create({data:{requestKey:input.requestKey,restaurantId,orderId:id,action:input.action,reason:input.reason,actorId,actorName:actor.name,before,after:json(after)}});
   return {balance:correctionBalance(after)};
  },{timeout:20000,isolationLevel:'Serializable'});
 }
};
