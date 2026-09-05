import { z } from 'zod';

export const aiReportRequestSchema = z.object({
  question: z.string().trim().min(3).max(500),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type AiReportRequest = z.infer<typeof aiReportRequestSchema>;
