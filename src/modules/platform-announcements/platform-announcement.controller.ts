import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { createAnnouncementSchema, updateAnnouncementSchema } from './platform-announcement.dto';
import { platformAnnouncementService } from './platform-announcement.service';

export const platformAnnouncementController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ data: await platformAnnouncementService.list() });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createAnnouncementSchema.parse(req.body);
    res.status(201).json({ data: await platformAnnouncementService.create(input) });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateAnnouncementSchema.parse(req.body);
    res.json({ data: await platformAnnouncementService.update(req.params.id, input) });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await platformAnnouncementService.remove(req.params.id);
    res.status(204).send();
  }),

  send: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await platformAnnouncementService.send(req.params.id) });
  }),
};
