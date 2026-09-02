import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { advisorLeadQuerySchema, createAdvisorLeadSchema, updateAdvisorLeadSchema } from './advisor-lead.dto';
import { advisorLeadService } from './advisor-lead.service';

export const advisorLeadController = {
  /** POST /api/v1/public/advisor-leads — "Contactar a un asesor" del Plan Elite (público). */
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createAdvisorLeadSchema.parse(req.body);
    const lead = await advisorLeadService.create(input);
    res.status(201).json({ data: lead });
  }),

  /** GET /api/v1/master/advisor-leads — la bandeja del equipo. */
  list: asyncHandler(async (req: Request, res: Response) => {
    const { status } = advisorLeadQuerySchema.parse(req.query);
    res.json({ data: await advisorLeadService.list(status) });
  }),

  /** PATCH /api/v1/master/advisor-leads/:id — marcar contactado/cerrado y anotar. */
  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateAdvisorLeadSchema.parse(req.body);
    res.json({ data: await advisorLeadService.update(req.params.id, input) });
  }),
};
