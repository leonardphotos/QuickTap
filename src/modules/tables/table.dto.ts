import { z } from 'zod';

export const createTableSchema = z.object({
  number: z.string().min(1).max(40),
});

export type CreateTableInput = z.infer<typeof createTableSchema>;
