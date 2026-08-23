import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { PLAN_BASE } from './plan-base';
import type {
  CreateCompanyInput,
  CreateContactInput,
  CreateEntryInput,
  CreateAccountInput,
  UpdateCompanyInput,
} from './accounting.dto';

const d = (n: number | string | Prisma.Decimal) => new Prisma.Decimal(n);
const cero = d(0);

/** Toda consulta pasa por acá: la empresa tiene que ser de ESTE inquilino. */
export async function assertCompany(restaurantId: string, companyId: string) {
  const c = await prisma.company.findFirst({ where: { id: companyId, restaurantId }, select: { id: true, name: true, currency: true } });
  if (!c) throw notFound('Empresa no encontrada.');
  return c;
}

export const accountingService = {
  // ─── Empresas ────────────────────────────────────────────────────────────

  async listCompanies(restaurantId: string) {
    const empresas = await prisma.company.findMany({
      where: { restaurantId },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: {
        id: true, name: true, taxId: true, currency: true, active: true,
        _count: { select: { entries: true, contacts: true } },
      },
    });
    return empresas.map((e) => ({
      id: e.id, nombre: e.name, rif: e.taxId, moneda: e.currency, activa: e.active,
      asientos: e._count.entries, contactos: e._count.contacts,
    }));
  },

  /**
   * Crear una empresa arranca su plan de cuentas. Sin plan no se puede cargar ni un asiento, y
   * pedirle a alguien que lo arme desde cero antes de poder registrar nada es la forma más
   * segura de que abandone el sistema el primer día.
   */
  async createCompany(restaurantId: string, input: CreateCompanyInput) {
    return prisma.$transaction(async (tx) => {
      const empresa = await tx.company.create({
        data: {
          restaurantId,
          name: input.name,
          taxId: input.taxId ?? null,
          address: input.address ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
          currency: input.currency ?? 'USD',
          fiscalYearStartMonth: input.fiscalYearStartMonth ?? 1,
        },
      });

      // El plan se crea en orden para que cada hija encuentre a su padre ya insertado.
      const idPorCodigo = new Map<string, string>();
      for (const c of PLAN_BASE) {
        const creada = await tx.ledgerAccount.create({
          data: {
            companyId: empresa.id,
            code: c.code,
            name: c.name,
            kind: c.kind,
            postable: c.postable ?? true,
            parentId: c.parent ? (idPorCodigo.get(c.parent) ?? null) : null,
          },
          select: { id: true },
        });
        idPorCodigo.set(c.code, creada.id);
      }
      return empresa;
    });
  },

  async updateCompany(restaurantId: string, companyId: string, input: UpdateCompanyInput) {
    await assertCompany(restaurantId, companyId);
    return prisma.company.update({ where: { id: companyId }, data: input });
  },

  // ─── Plan de cuentas ─────────────────────────────────────────────────────

  async listAccounts(restaurantId: string, companyId: string) {
    await assertCompany(restaurantId, companyId);
    const cuentas = await prisma.ledgerAccount.findMany({
      where: { companyId },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, kind: true, parentId: true, postable: true, active: true },
    });
    // Saldo por cuenta, de una sola pasada sobre las líneas: con doscientas cuentas, una
    // consulta por cada una sería el clásico N+1 que hace lenta esta pantalla.
    const saldos = await prisma.journalLine.groupBy({
      by: ['accountId'],
      // NO se filtran los anulados: al anular se crea un contra-asiento que ya los neutraliza,
      // así que excluirlos además restaría dos veces. Ambos quedan en el libro, que es como
      // corresponde — el original se conserva y el reverso explica por qué.
      where: { entry: { companyId } },
      _sum: { debit: true, credit: true },
    });
    const porCuenta = new Map(saldos.map((s) => [s.accountId, s]));
    return cuentas.map((c) => {
      const s = porCuenta.get(c.id);
      const debe = d(s?._sum.debit ?? 0);
      const haber = d(s?._sum.credit ?? 0);
      // El saldo se muestra del lado natural de la cuenta: un activo con más debe que haber
      // tiene saldo positivo, y un ingreso lo tiene cuando el haber supera al debe.
      const natural = c.kind === 'ASSET' || c.kind === 'EXPENSE' ? debe.sub(haber) : haber.sub(debe);
      return { ...c, debe: debe.toFixed(2), haber: haber.toFixed(2), saldo: natural.toFixed(2) };
    });
  },

  async createAccount(restaurantId: string, companyId: string, input: CreateAccountInput) {
    await assertCompany(restaurantId, companyId);
    const repetida = await prisma.ledgerAccount.findFirst({ where: { companyId, code: input.code }, select: { id: true } });
    if (repetida) throw badRequest(`Ya existe una cuenta con el código ${input.code}.`);
    if (input.parentId) {
      const padre = await prisma.ledgerAccount.findFirst({ where: { id: input.parentId, companyId }, select: { id: true } });
      if (!padre) throw badRequest('La cuenta padre no existe en esta empresa.');
    }
    return prisma.ledgerAccount.create({ data: { companyId, ...input } });
  },

  // ─── Asientos ────────────────────────────────────────────────────────────

  /**
   * Registra un asiento. Se valida que cuadre —debe igual a haber— antes de escribir nada:
   * un libro descuadrado no se arregla después, se arrastra.
   */
  async createEntry(restaurantId: string, companyId: string, userId: string, input: CreateEntryInput) {
    await assertCompany(restaurantId, companyId);
    if (input.lines.length < 2) throw badRequest('Un asiento necesita al menos dos líneas.');

    const totalDebe = input.lines.reduce((a, l) => a.add(d(l.debit ?? 0)), cero);
    const totalHaber = input.lines.reduce((a, l) => a.add(d(l.credit ?? 0)), cero);
    if (totalDebe.lessThanOrEqualTo(0)) throw badRequest('El asiento no tiene montos.');
    if (!totalDebe.equals(totalHaber)) {
      throw badRequest(`El asiento no cuadra: debe ${totalDebe.toFixed(2)} contra haber ${totalHaber.toFixed(2)}.`);
    }
    for (const l of input.lines) {
      const deb = d(l.debit ?? 0);
      const cre = d(l.credit ?? 0);
      if (deb.greaterThan(0) && cre.greaterThan(0)) throw badRequest('Una línea no puede ir al debe y al haber a la vez.');
      if (deb.lessThanOrEqualTo(0) && cre.lessThanOrEqualTo(0)) throw badRequest('Cada línea necesita un monto.');
    }

    const cuentas = await prisma.ledgerAccount.findMany({
      where: { id: { in: input.lines.map((l) => l.accountId) }, companyId },
      select: { id: true, postable: true, name: true },
    });
    const porId = new Map(cuentas.map((c) => [c.id, c]));
    for (const l of input.lines) {
      const c = porId.get(l.accountId);
      if (!c) throw badRequest('Alguna cuenta no pertenece a esta empresa.');
      // Las cuentas de agrupación totalizan a sus hijas: recibir asientos las haría contar dos veces.
      if (!c.postable) throw badRequest(`"${c.name}" es una cuenta de agrupación y no recibe asientos.`);
    }

    return prisma.$transaction(async (tx) => {
      const ultimo = await tx.journalEntry.findFirst({ where: { companyId }, orderBy: { number: 'desc' }, select: { number: true } });
      return tx.journalEntry.create({
        data: {
          companyId,
          number: (ultimo?.number ?? 0) + 1,
          date: new Date(input.date),
          description: input.description,
          reference: input.reference ?? null,
          source: input.source ?? 'MANUAL',
          createdByUserId: userId,
          lines: {
            createMany: {
              data: input.lines.map((l) => ({
                accountId: l.accountId,
                debit: d(l.debit ?? 0),
                credit: d(l.credit ?? 0),
                detail: l.detail ?? null,
                contactId: l.contactId ?? null,
              })),
            },
          },
        },
        include: { lines: true },
      });
    });
  },

  async listEntries(restaurantId: string, companyId: string, opciones: { desde?: string; hasta?: string; buscar?: string }) {
    await assertCompany(restaurantId, companyId);
    const asientos = await prisma.journalEntry.findMany({
      where: {
        companyId,
        ...(opciones.desde || opciones.hasta
          ? { date: { ...(opciones.desde ? { gte: new Date(`${opciones.desde}T00:00:00`) } : {}), ...(opciones.hasta ? { lte: new Date(`${opciones.hasta}T23:59:59`) } : {}) } }
          : {}),
        ...(opciones.buscar
          ? { OR: [{ description: { contains: opciones.buscar, mode: 'insensitive' } }, { reference: { contains: opciones.buscar, mode: 'insensitive' } }] }
          : {}),
      },
      orderBy: [{ date: 'desc' }, { number: 'desc' }],
      take: 300,
      include: { lines: { include: { account: { select: { code: true, name: true } }, contact: { select: { name: true } } } } },
    });
    return asientos.map((a) => ({
      id: a.id,
      numero: a.number,
      fecha: a.date,
      descripcion: a.description,
      referencia: a.reference,
      anulado: !!a.voidedAt,
      total: a.lines.reduce((s, l) => s.add(l.debit), cero).toFixed(2),
      lineas: a.lines.map((l) => ({
        cuenta: `${l.account.code} ${l.account.name}`,
        debe: l.debit.toFixed(2),
        haber: l.credit.toFixed(2),
        detalle: l.detail,
        contacto: l.contact?.name ?? null,
      })),
    }));
  },

  /**
   * Anular NO borra: marca el asiento y crea uno espejo que lo revierte. Un libro con
   * agujeros no es un libro, y el número que faltaba es justo el que pide el fiscalizador.
   */
  async voidEntry(restaurantId: string, companyId: string, entryId: string, userId: string, reason: string) {
    await assertCompany(restaurantId, companyId);
    const original = await prisma.journalEntry.findFirst({ where: { id: entryId, companyId }, include: { lines: true } });
    if (!original) throw notFound('Asiento no encontrado.');
    if (original.voidedAt) throw badRequest('Ese asiento ya está anulado.');

    return prisma.$transaction(async (tx) => {
      const ultimo = await tx.journalEntry.findFirst({ where: { companyId }, orderBy: { number: 'desc' }, select: { number: true } });
      const reverso = await tx.journalEntry.create({
        data: {
          companyId,
          number: (ultimo?.number ?? 0) + 1,
          date: new Date(),
          description: `Anulación del asiento ${original.number}: ${reason}`,
          source: 'REVERSAL',
          reference: original.reference,
          createdByUserId: userId,
          lines: {
            // Espejo: lo que iba al debe va al haber y viceversa.
            createMany: {
              data: original.lines.map((l) => ({
                accountId: l.accountId,
                debit: l.credit,
                credit: l.debit,
                detail: l.detail,
                contactId: l.contactId,
              })),
            },
          },
        },
        select: { id: true, number: true },
      });
      await tx.journalEntry.update({ where: { id: entryId }, data: { voidedAt: new Date(), voidReason: reason } });
      return { anulado: original.number, reverso: reverso.number };
    });
  },

  // ─── Contactos ───────────────────────────────────────────────────────────

  async listContacts(restaurantId: string, companyId: string) {
    await assertCompany(restaurantId, companyId);
    return prisma.businessContact.findMany({ where: { companyId }, orderBy: [{ active: 'desc' }, { name: 'asc' }] });
  },

  async createContact(restaurantId: string, companyId: string, input: CreateContactInput) {
    await assertCompany(restaurantId, companyId);
    return prisma.businessContact.create({ data: { companyId, ...input } });
  },

  // ─── Reportes ────────────────────────────────────────────────────────────

  /**
   * Balance de comprobación y estado de resultados en una sola pasada.
   *
   * El resultado del período sale de ingresos menos gastos; el balance cuadra cuando activo
   * iguala pasivo más patrimonio MÁS ese resultado, porque hasta que no se cierra el ejercicio
   * la ganancia todavía no está en el patrimonio.
   */
  async reports(restaurantId: string, companyId: string, desde?: string, hasta?: string) {
    await assertCompany(restaurantId, companyId);
    const rango = desde || hasta
      ? { date: { ...(desde ? { gte: new Date(`${desde}T00:00:00`) } : {}), ...(hasta ? { lte: new Date(`${hasta}T23:59:59`) } : {}) } }
      : {};

    const [cuentas, saldos] = await Promise.all([
      prisma.ledgerAccount.findMany({ where: { companyId }, select: { id: true, code: true, name: true, kind: true, postable: true }, orderBy: { code: 'asc' } }),
      prisma.journalLine.groupBy({
        by: ['accountId'],
        // Los anulados entran: su contra-asiento ya los cancela (ver listAccounts).
        where: { entry: { companyId, ...rango } },
        _sum: { debit: true, credit: true },
      }),
    ]);
    const porCuenta = new Map(saldos.map((s) => [s.accountId, s]));

    const filas = cuentas
      .filter((c) => c.postable)
      .map((c) => {
        const s = porCuenta.get(c.id);
        const debe = d(s?._sum.debit ?? 0);
        const haber = d(s?._sum.credit ?? 0);
        const natural = c.kind === 'ASSET' || c.kind === 'EXPENSE' ? debe.sub(haber) : haber.sub(debe);
        return { code: c.code, name: c.name, kind: c.kind, debe, haber, saldo: natural };
      })
      .filter((f) => !f.debe.equals(0) || !f.haber.equals(0));

    const sumaPorTipo = (k: string) => filas.filter((f) => f.kind === k).reduce((a, f) => a.add(f.saldo), cero);
    const ingresos = sumaPorTipo('INCOME');
    const gastos = sumaPorTipo('EXPENSE');
    const activo = sumaPorTipo('ASSET');
    const pasivo = sumaPorTipo('LIABILITY');
    const patrimonio = sumaPorTipo('EQUITY');
    const resultado = ingresos.sub(gastos);

    return {
      balanceComprobacion: filas.map((f) => ({
        code: f.code, name: f.name, kind: f.kind,
        debe: f.debe.toFixed(2), haber: f.haber.toFixed(2), saldo: f.saldo.toFixed(2),
      })),
      totales: {
        debe: filas.reduce((a, f) => a.add(f.debe), cero).toFixed(2),
        haber: filas.reduce((a, f) => a.add(f.haber), cero).toFixed(2),
      },
      estadoResultados: {
        ingresos: ingresos.toFixed(2),
        gastos: gastos.toFixed(2),
        resultado: resultado.toFixed(2),
        margen: ingresos.greaterThan(0) ? resultado.div(ingresos).mul(100).toFixed(1) : '0.0',
      },
      balanceGeneral: {
        activo: activo.toFixed(2),
        pasivo: pasivo.toFixed(2),
        patrimonio: patrimonio.toFixed(2),
        resultadoDelPeriodo: resultado.toFixed(2),
        // Si esto no da cero hay un asiento mal cargado; se muestra en vez de esconderse.
        descuadre: activo.sub(pasivo.add(patrimonio).add(resultado)).toFixed(2),
      },
    };
  },

  /** Resumen del panel: lo que se mira todos los días. */
  async dashboard(restaurantId: string, companyId: string) {
    await assertCompany(restaurantId, companyId);
    const hoy = new Date();
    const desdeMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const desde12 = new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1);

    const [lineas, asientos, contactos] = await Promise.all([
      prisma.journalLine.findMany({
        // Los anulados entran: su contra-asiento ya los cancela (ver listAccounts).
        where: { entry: { companyId, date: { gte: desde12 } } },
        select: { debit: true, credit: true, account: { select: { kind: true } }, entry: { select: { date: true } } },
      }),
      // Acá sí se excluyen: "cuántos asientos tengo" no debería contar los que se anularon.
      prisma.journalEntry.count({ where: { companyId, voidedAt: null } }),
      prisma.businessContact.count({ where: { companyId, active: true } }),
    ]);

    const mesKey = (f: Date) => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
    const porMes = new Map<string, { ingresos: Prisma.Decimal; gastos: Prisma.Decimal }>();
    for (let i = 0; i < 12; i++) {
      const f = new Date(hoy.getFullYear(), hoy.getMonth() - 11 + i, 1);
      porMes.set(mesKey(f), { ingresos: cero, gastos: cero });
    }
    let ingresosMes = cero;
    let gastosMes = cero;
    for (const l of lineas) {
      const k = mesKey(l.entry.date);
      const fila = porMes.get(k);
      const kind = l.account.kind;
      if (kind === 'INCOME') {
        const v = d(l.credit).sub(d(l.debit));
        if (fila) fila.ingresos = fila.ingresos.add(v);
        if (l.entry.date >= desdeMes) ingresosMes = ingresosMes.add(v);
      } else if (kind === 'EXPENSE') {
        const v = d(l.debit).sub(d(l.credit));
        if (fila) fila.gastos = fila.gastos.add(v);
        if (l.entry.date >= desdeMes) gastosMes = gastosMes.add(v);
      }
    }

    return {
      mes: {
        ingresos: ingresosMes.toFixed(2),
        gastos: gastosMes.toFixed(2),
        resultado: ingresosMes.sub(gastosMes).toFixed(2),
      },
      asientos,
      contactos,
      serie: [...porMes.entries()].map(([mes, v]) => ({
        mes,
        ingresos: Number(v.ingresos.toFixed(2)),
        gastos: Number(v.gastos.toFixed(2)),
      })),
    };
  },
};
