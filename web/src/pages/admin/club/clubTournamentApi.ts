import { api } from '@/api/client';

/**
 * Torneos sociales de pádel. Se compite individualmente aunque se juegue en
 * parejas: los puntos que anota tu pareja son tuyos, y la tabla es la suma de
 * todo lo que anotaste.
 */

export type TournamentFormat = 'AMERICANO' | 'MEXICANO';
export type TournamentScoring = 'POINTS' | 'TIME';

export interface TournamentMatch {
  id: string;
  round: number;
  courtName: string;
  teamA: [string, string];
  teamB: [string, string];
  scoreA: number | null;
  scoreB: number | null;
}

export interface TournamentStanding {
  playerId: string;
  name: string;
  points: number;
  matchesPlayed: number;
  diff: number;
  wins: number;
}

export interface Tournament {
  id: string;
  name: string;
  format: TournamentFormat;
  scoring: TournamentScoring;
  pointsPerMatch: number;
  minutesPerRound: number;
  courtNames: string[];
  status: 'RUNNING' | 'FINISHED';
  currentRound: number;
  createdAt: string;
  players: { id: string; name: string }[];
  /** Quién descansa esta ronda: no caben en las canchas disponibles. */
  resting: { id: string; name: string }[];
  currentMatches: TournamentMatch[];
  history: TournamentMatch[];
  standings: TournamentStanding[];
  roundComplete: boolean;
}

export const clubTournamentApi = {
  active: () => api.get<{ data: Tournament | null }>('/club-tournament/active').then((r) => r.data.data),
  create: (body: {
    name: string;
    format: TournamentFormat;
    scoring: TournamentScoring;
    pointsPerMatch: number;
    minutesPerRound: number;
    players: string[];
    courtNames: string[];
  }) => api.post<{ data: Tournament }>('/club-tournament', body).then((r) => r.data.data),
  nextRound: (id: string) =>
    api.post<{ data: Tournament }>(`/club-tournament/${id}/next-round`).then((r) => r.data.data),
  recordScore: (matchId: string, scoreA: number, scoreB: number) =>
    api
      .patch<{ data: Tournament }>(`/club-tournament/matches/${matchId}`, { scoreA, scoreB })
      .then((r) => r.data.data),
  finish: (id: string) => api.post<{ data: Tournament }>(`/club-tournament/${id}/finish`).then((r) => r.data.data),
};

export const FORMAT_LABELS: Record<TournamentFormat, string> = {
  AMERICANO: 'Americano',
  MEXICANO: 'Mexicano',
};

export const FORMAT_HINTS: Record<TournamentFormat, string> = {
  AMERICANO: 'Las parejas rotan: juegas con y contra la mayor cantidad de gente posible.',
  MEXICANO: 'Los cruces salen de la tabla: los que van ganando se enfrentan entre sí.',
};
