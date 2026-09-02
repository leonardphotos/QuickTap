import { prisma } from '../../config/prisma';
import { notFound } from '../../utils/http-error';
import { platformSettingsService } from '../platform-settings/platform-settings.service';
import { whatsappLinkService } from '../whatsapp-link/whatsapp-link.service';
import type { CreateAdvisorLeadInput, UpdateAdvisorLeadInput } from './advisor-lead.dto';

/** Mensaje que le llega al número verificador del máster. */
function mensajeDe(lead: { contactName: string; phone: string; address: string; businessName: string }): string {
  return [
    '🟡 *Solicitud de asesor — Plan Elite*',
    '',
    `👤 ${lead.contactName}`,
    `📱 ${lead.phone}`,
    `🏪 ${lead.businessName}`,
    `📍 ${lead.address}`,
    '',
    'Llámalo cuando puedas. Queda registrada en el Dashboard maestro → Asesorías.',
  ].join('\n');
}

/**
 * Aviso por WhatsApp al verificador. Nunca tumba la solicitud: si el número no está
 * configurado, el WhatsApp del máster está caído o es de madrugada (los envíos del máster
 * tienen ventana horaria), la fila ya quedó guardada y se ve en el dashboard igual.
 */
async function avisarAlVerificador(lead: {
  id: string;
  contactName: string;
  phone: string;
  address: string;
  businessName: string;
}): Promise<void> {
  try {
    const destino = await platformSettingsService.getSubscriptionVerifierPhone();
    if (!destino) return;
    const enviado = await whatsappLinkService.enviar(null, destino, mensajeDe(lead));
    if (enviado) {
      await prisma.advisorLead.update({ where: { id: lead.id }, data: { notifiedAt: new Date() } });
    }
  } catch {
    // Silencioso a propósito: el aviso es un extra sobre la fila, no la fila misma.
  }
}

export const advisorLeadService = {
  /** Formulario público. Devuelve lo mínimo: el prospecto no necesita saber nada interno. */
  async create(input: CreateAdvisorLeadInput) {
    const lead = await prisma.advisorLead.create({
      data: { ...input, plan: 'ELITE' },
      select: { id: true, contactName: true, phone: true, address: true, businessName: true, createdAt: true },
    });
    // Sin await: el prospecto no tiene por qué esperar a que WhatsApp responda para ver
    // su confirmación en pantalla.
    void avisarAlVerificador(lead);
    return { id: lead.id, createdAt: lead.createdAt };
  },

  async list(status?: 'PENDING' | 'CONTACTED' | 'CLOSED' | 'DISCARDED') {
    const [leads, pendientes] = await Promise.all([
      prisma.advisorLead.findMany({
        where: status ? { status } : {},
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: 300,
      }),
      prisma.advisorLead.count({ where: { status: 'PENDING' } }),
    ]);
    return { leads, pendientes };
  },

  async update(id: string, input: UpdateAdvisorLeadInput) {
    const existe = await prisma.advisorLead.findUnique({ where: { id }, select: { id: true } });
    if (!existe) throw notFound('Solicitud no encontrada.');
    return prisma.advisorLead.update({ where: { id }, data: input });
  },
};
