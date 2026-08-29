import { prisma } from '../../config/prisma';
import { resolveDateFilter, type ReportRange } from '../../utils/date-range';
import type { TrackRegistrationInput } from './registration-funnel.dto';

/**
 * Embudo de registro: cuánta gente llega a la pasarela y no termina de registrarse, y quiénes
 * son los que dejaron algún dato de contacto en el camino.
 *
 * El seguimiento es de "mejor esfuerzo": nunca debe hacer fallar el registro de nadie. Por eso
 * el controlador ignora los errores y el frontend lo llama sin await.
 */

/** Solo los campos que de verdad vienen con algo — así un guardado parcial no borra lo anterior
 * (el navegador manda el campo que acaba de perder el foco, no el formulario entero). */
function soloLoLleno(input: TrackRegistrationInput) {
  const campos = ['businessType', 'shopRubro', 'restaurantName', 'slug', 'whatsappPhone', 'ownerName', 'email', 'landingQuery', 'lastError'] as const;
  const data: Record<string, string> = {};
  for (const campo of campos) {
    const valor = input[campo]?.trim();
    if (valor) data[campo] = valor;
  }
  return data;
}

export const registrationFunnelService = {
  /**
   * Registra o actualiza el avance de un intento. `stage` solo AVANZA (START → FORM → COMPLETED):
   * si alguien vuelve atrás en el navegador, el intento no debe "desprogresar" y contarse como
   * abandonado en un paso anterior al que ya había alcanzado.
   */
  async track(input: TrackRegistrationInput) {
    const data = soloLoLleno(input);
    const existente = await prisma.registrationAttempt.findUnique({
      where: { sessionId: input.sessionId },
      select: { stage: true, completedAt: true },
    });

    // Ya se registró: no se toca más. Lo que escriba después (ej. abrió /empezar otra vez en la
    // misma pestaña) no puede revivirlo como abandono.
    if (existente?.completedAt) return { ok: true };

    const ORDEN = { START: 0, FORM: 1, COMPLETED: 2 } as const;
    const stagePedido = input.stage ?? 'START';
    const stage =
      existente && ORDEN[existente.stage as keyof typeof ORDEN] >= ORDEN[stagePedido] ? existente.stage : stagePedido;

    await prisma.registrationAttempt.upsert({
      where: { sessionId: input.sessionId },
      create: { sessionId: input.sessionId, stage, ...data },
      update: { stage, ...data },
    });
    return { ok: true };
  },

  /** Cierra el intento cuando el registro sí terminó — lo llama auth.service al crear la cuenta. */
  async markCompleted(sessionId: string, restaurantId: string) {
    await prisma.registrationAttempt.updateMany({
      where: { sessionId },
      data: { stage: 'COMPLETED', completedAt: new Date(), restaurantId, lastError: null },
    });
  },

  /**
   * Resumen + lista para el Dashboard maestro.
   *
   * "Abandonos" = intentos sin completar de MÁS DE 30 MINUTOS. El corte existe porque quien
   * está llenando el formulario ahora mismo todavía no abandonó nada: sin él, la cifra subiría
   * con cada visitante en vivo y bajaría sola al rato, que es justo lo contrario de una métrica.
   */
  async overview(range: ReportRange) {
    const filtro = resolveDateFilter({ range });
    const dondeFecha = filtro ? { createdAt: filtro } : {};
    const haceMediaHora = new Date(Date.now() - 30 * 60_000);

    const [total, completados, abandonos, porVertical, contactables] = await Promise.all([
      prisma.registrationAttempt.count({ where: dondeFecha }),
      prisma.registrationAttempt.count({ where: { ...dondeFecha, completedAt: { not: null } } }),
      prisma.registrationAttempt.count({
        where: { ...dondeFecha, completedAt: null, updatedAt: { lt: haceMediaHora } },
      }),
      prisma.registrationAttempt.groupBy({
        by: ['stage'],
        where: { ...dondeFecha, completedAt: null, updatedAt: { lt: haceMediaHora } },
        _count: true,
      }),
      // La lista para llamar: solo los que dejaron con qué contactarlos. Un intento sin
      // teléfono ni correo no sirve de nada en una lista de contactos, solo la ensucia.
      prisma.registrationAttempt.findMany({
        where: {
          ...dondeFecha,
          completedAt: null,
          updatedAt: { lt: haceMediaHora },
          OR: [{ whatsappPhone: { not: null } }, { email: { not: null } }],
        },
        orderBy: { updatedAt: 'desc' },
        take: 300,
        select: {
          id: true,
          stage: true,
          businessType: true,
          shopRubro: true,
          restaurantName: true,
          slug: true,
          whatsappPhone: true,
          ownerName: true,
          email: true,
          lastError: true,
          contactedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const porEtapa = { START: 0, FORM: 0 } as Record<string, number>;
    for (const fila of porVertical) porEtapa[fila.stage] = fila._count;

    return {
      total,
      completados,
      abandonos,
      // % de los que llegaron y sí se registraron. Sin visitas todavía, 0 en vez de NaN.
      conversion: total > 0 ? Math.round((completados / total) * 1000) / 10 : 0,
      // Dónde se caen: eligiendo vertical, o ya con el formulario abierto.
      abandonoEnVertical: porEtapa.START ?? 0,
      abandonoEnFormulario: porEtapa.FORM ?? 0,
      contactables,
    };
  },

  /** Marca/desmarca "ya lo contacté", para no llamar dos veces al mismo. */
  async setContacted(id: string, contactado: boolean) {
    return prisma.registrationAttempt.update({
      where: { id },
      data: { contactedAt: contactado ? new Date() : null },
      select: { id: true, contactedAt: true },
    });
  },
};
