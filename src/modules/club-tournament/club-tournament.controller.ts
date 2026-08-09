import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { createTournamentSchema, recordMatchScoreSchema } from './club-tournament.dto';
import { clubTournamentService } from './club-tournament.service';

export const clubTournamentController = {
  active: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubTournamentService.getActive(req.restaurantId!) });
  }),
  finished: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubTournamentService.listFinished(req.restaurantId!) });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createTournamentSchema.parse(req.body);
    res.status(201).json({ data: await clubTournamentService.create(req.restaurantId!, input) });
  }),
  nextRound: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubTournamentService.nextRound(req.restaurantId!, req.params.id) });
  }),
  recordScore: asyncHandler(async (req: Request, res: Response) => {
    const input = recordMatchScoreSchema.parse(req.body);
    res.json({ data: await clubTournamentService.recordScore(req.restaurantId!, req.params.matchId, input) });
  }),
  finish: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubTournamentService.finish(req.restaurantId!, req.params.id) });
  }),
  remove: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubTournamentService.remove(req.restaurantId!, req.params.id) });
  }),
};
