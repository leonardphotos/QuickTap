import { z } from 'zod';

export const createTournamentSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    format: z.enum(['AMERICANO', 'MEXICANO']),
    scoring: z.enum(['POINTS', 'TIME']).optional().default('POINTS'),
    /** Puntos que se reparten entre los dos equipos en cada partido. */
    pointsPerMatch: z.number().int().min(4).max(100).optional().default(24),
    minutesPerRound: z.number().int().min(3).max(90).optional().default(15),
    /** Nombres de jugadores. Un pádel social son parejas: hacen falta múltiplos de 4
     * para que nadie quede suelto, pero se aceptan sobrantes (rotan descansando). */
    players: z.array(z.string().trim().min(1).max(40)).min(4).max(64),
    /** Canchas donde se juega, por nombre. */
    courtNames: z.array(z.string().trim().min(1).max(60)).min(1).max(12),
  })
  .superRefine((data, ctx) => {
    const unique = new Set(data.players.map((p) => p.toLowerCase()));
    if (unique.size !== data.players.length) {
      ctx.addIssue({ code: 'custom', path: ['players'], message: 'Hay nombres de jugador repetidos.' });
    }
  });

export const recordMatchScoreSchema = z.object({
  scoreA: z.number().int().min(0).max(200),
  scoreB: z.number().int().min(0).max(200),
});

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
export type RecordMatchScoreInput = z.infer<typeof recordMatchScoreSchema>;
