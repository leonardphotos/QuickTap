import { z } from 'zod';

export const connectOlaclickSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .regex(/^olk_/, "La API Key de OlaClick debe empezar con 'olk_'."),
});

export type ConnectOlaclickInput = z.infer<typeof connectOlaclickSchema>;

/**
 * El cliente NO manda de vuelta el menú completo a confirmar (eso obligaría
 * a confiar en datos que el navegador podría manipular). Solo manda la
 * lista de productos que decidió EXCLUIR de la vista previa; el backend
 * vuelve a pedirle el menú fresco a OlaClick al confirmar y aplica el
 * filtro ahí mismo.
 */
export const confirmOlaclickImportSchema = z.object({
  excludedProductExternalIds: z.array(z.string()).default([]),
});

export type ConfirmOlaclickImportInput = z.infer<typeof confirmOlaclickImportSchema>;
