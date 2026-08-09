import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, conflict, notFound } from '../../utils/http-error';
import { emitToKitchen, SocketEvents } from '../../sockets';
import { generateRound, type PairingPlayer, type PlayedMatch } from './club-tournament.pairing';
import type { CreateTournamentInput, RecordMatchScoreInput } from './club-tournament.dto';

interface StandingRow {
  playerId: string;
  name: string;
  points: number;
  matchesPlayed: number;
  /** Puntos a favor menos en contra: desempata a dos con los mismos puntos. */
  diff: number;
  wins: number;
}

/**
 * Tabla de posiciones. En un social se compite individual: los puntos que anotó
 * tu pareja son tuyos, así que la clasificación es la suma de todo lo que
 * anotaste, ronda a ronda. Solo cuentan los partidos con resultado cargado.
 */
function buildStandings(
  players: { id: string; name: string }[],
  matches: { teamAPlayer1Id: string; teamAPlayer2Id: string; teamBPlayer1Id: string; teamBPlayer2Id: string; scoreA: number | null; scoreB: number | null }[],
): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    players.map((p) => [p.id, { playerId: p.id, name: p.name, points: 0, matchesPlayed: 0, diff: 0, wins: 0 }]),
  );

  for (const m of matches) {
    if (m.scoreA == null || m.scoreB == null) continue;
    const teamA = [m.teamAPlayer1Id, m.teamAPlayer2Id];
    const teamB = [m.teamBPlayer1Id, m.teamBPlayer2Id];

    for (const [team, own, rival] of [
      [teamA, m.scoreA, m.scoreB],
      [teamB, m.scoreB, m.scoreA],
    ] as [string[], number, number][]) {
      for (const id of team) {
        const row = rows.get(id);
        if (!row) continue;
        row.points += own;
        row.diff += own - rival;
        row.matchesPlayed += 1;
        if (own > rival) row.wins += 1;
      }
    }
  }

  return [...rows.values()].sort(
    (a, b) => b.points - a.points || b.diff - a.diff || b.wins - a.wins || a.name.localeCompare(b.name),
  );
}

const tournamentInclude = {
  players: { orderBy: { sortOrder: 'asc' } },
  matches: { orderBy: [{ round: 'asc' }, { createdAt: 'asc' }] },
} satisfies Prisma.ClubTournamentInclude;

type LoadedTournament = Awaited<ReturnType<typeof loadTournament>>;

async function loadTournament(restaurantId: string, id: string) {
  const tournament = await prisma.clubTournament.findFirst({
    where: { id, restaurantId },
    include: tournamentInclude,
  });
  if (!tournament) throw notFound('Ese torneo no existe.');
  return tournament;
}

/** Forma que consume la tablet: el torneo, la ronda en curso y la tabla en vivo. */
function serialize(t: LoadedTournament) {
  const standings = buildStandings(t.players, t.matches);
  const currentMatches = t.matches.filter((m) => m.round === t.currentRound);
  const playingIds = new Set(
    currentMatches.flatMap((m) => [m.teamAPlayer1Id, m.teamAPlayer2Id, m.teamBPlayer1Id, m.teamBPlayer2Id]),
  );

  return {
    id: t.id,
    name: t.name,
    format: t.format,
    scoring: t.scoring,
    pointsPerMatch: t.pointsPerMatch,
    minutesPerRound: t.minutesPerRound,
    courtNames: t.courtNames as string[],
    status: t.status,
    currentRound: t.currentRound,
    createdAt: t.createdAt,
    players: t.players.map((p) => ({ id: p.id, name: p.name })),
    /** Quién descansa esta ronda: no caben en las canchas disponibles. */
    resting: t.players.filter((p) => !playingIds.has(p.id)).map((p) => ({ id: p.id, name: p.name })),
    currentMatches: currentMatches.map((m) => ({
      id: m.id,
      round: m.round,
      courtName: m.courtName,
      teamA: [m.teamAPlayer1Id, m.teamAPlayer2Id],
      teamB: [m.teamBPlayer1Id, m.teamBPlayer2Id],
      scoreA: m.scoreA,
      scoreB: m.scoreB,
    })),
    /** Todo lo jugado, para el historial de rondas anteriores. */
    history: t.matches
      .filter((m) => m.round < t.currentRound)
      .map((m) => ({
        id: m.id,
        round: m.round,
        courtName: m.courtName,
        teamA: [m.teamAPlayer1Id, m.teamAPlayer2Id],
        teamB: [m.teamBPlayer1Id, m.teamBPlayer2Id],
        scoreA: m.scoreA,
        scoreB: m.scoreB,
      })),
    standings,
    /** La ronda solo avanza cuando todos los partidos tienen resultado. */
    roundComplete: currentMatches.length > 0 && currentMatches.every((m) => m.scoreA != null && m.scoreB != null),
  };
}

function toPairingPlayers(players: { id: string; sortOrder: number }[]): PairingPlayer[] {
  return players.map((p) => ({ id: p.id, sortOrder: p.sortOrder }));
}

function toPlayedMatches(matches: LoadedTournament['matches']): PlayedMatch[] {
  return matches.map((m) => ({
    teamAPlayer1Id: m.teamAPlayer1Id,
    teamAPlayer2Id: m.teamAPlayer2Id,
    teamBPlayer1Id: m.teamBPlayer1Id,
    teamBPlayer2Id: m.teamBPlayer2Id,
  }));
}

export const clubTournamentService = {
  /** El torneo que se está jugando ahora, si hay alguno. */
  async getActive(restaurantId: string) {
    const tournament = await prisma.clubTournament.findFirst({
      where: { restaurantId, status: 'RUNNING' },
      orderBy: { createdAt: 'desc' },
      include: tournamentInclude,
    });
    return tournament ? serialize(tournament) : null;
  },

  async create(restaurantId: string, input: CreateTournamentInput) {
    const running = await prisma.clubTournament.findFirst({
      where: { restaurantId, status: 'RUNNING' },
      select: { id: true, name: true },
    });
    // Un club juega un social a la vez: dos torneos abiertos se pisarían las
    // canchas y nadie sabría en cuál cargar el resultado.
    if (running) throw conflict(`Ya tienes "${running.name}" en juego. Termínalo antes de empezar otro.`);

    if (input.players.length < input.courtNames.length * 4) {
      throw badRequest('No hay jugadores suficientes para todas las canchas que elegiste.');
    }

    const created = await prisma.clubTournament.create({
      data: {
        restaurantId,
        name: input.name,
        format: input.format,
        scoring: input.scoring,
        pointsPerMatch: input.pointsPerMatch,
        minutesPerRound: input.minutesPerRound,
        courtNames: input.courtNames,
        players: { create: input.players.map((name, i) => ({ name, sortOrder: i })) },
      },
      include: tournamentInclude,
    });

    // Se genera la ronda 1 en el acto: un torneo recién creado sin cruces no le
    // sirve a nadie, y la pantalla arrancaría vacía.
    return this.nextRound(restaurantId, created.id);
  },

  /**
   * Cierra la ronda actual y arma la siguiente. Exige que todos los partidos en
   * curso tengan resultado: el Mexicano necesita la tabla para emparejar, y sin
   * marcadores la tabla no existe.
   */
  async nextRound(restaurantId: string, id: string) {
    const t = await loadTournament(restaurantId, id);
    if (t.status === 'FINISHED') throw badRequest('Este torneo ya terminó.');

    const current = t.matches.filter((m) => m.round === t.currentRound);
    if (current.length > 0 && current.some((m) => m.scoreA == null || m.scoreB == null)) {
      throw badRequest('Carga el resultado de todos los partidos antes de pasar a la siguiente ronda.');
    }

    const standings = buildStandings(t.players, t.matches);
    const generated = generateRound(
      t.format,
      toPairingPlayers(t.players),
      t.courtNames as string[],
      toPlayedMatches(t.matches),
      standings.map((s) => s.playerId),
    );
    if (generated.length === 0) throw badRequest('No hay jugadores suficientes para armar una ronda.');

    const round = t.currentRound + 1;
    const updated = await prisma.$transaction(async (tx) => {
      await tx.clubTournamentMatch.createMany({
        data: generated.map((m) => ({ ...m, tournamentId: t.id, round })),
      });
      return tx.clubTournament.update({
        where: { id: t.id },
        data: { currentRound: round },
        include: tournamentInclude,
      });
    });

    emitToKitchen(restaurantId, SocketEvents.CLUB_TOURNAMENT_UPDATED, { id: t.id });
    return serialize(updated);
  },

  async recordScore(restaurantId: string, matchId: string, input: RecordMatchScoreInput) {
    const match = await prisma.clubTournamentMatch.findFirst({
      where: { id: matchId, tournament: { restaurantId } },
      include: { tournament: { select: { id: true, status: true, scoring: true, pointsPerMatch: true } } },
    });
    if (!match) throw notFound('Ese partido no existe.');
    if (match.tournament.status === 'FINISHED') throw badRequest('Este torneo ya terminó.');

    // En modo POINTS el partido se juega a repartir un total fijo (ej. 24 puntos
    // entre los dos). Si la suma no da, alguien anotó mal el marcador.
    if (match.tournament.scoring === 'POINTS' && input.scoreA + input.scoreB !== match.tournament.pointsPerMatch) {
      throw badRequest(`Los dos marcadores tienen que sumar ${match.tournament.pointsPerMatch}.`);
    }

    await prisma.clubTournamentMatch.update({
      where: { id: matchId },
      data: { scoreA: input.scoreA, scoreB: input.scoreB, playedAt: new Date() },
    });

    emitToKitchen(restaurantId, SocketEvents.CLUB_TOURNAMENT_UPDATED, { id: match.tournament.id });
    return serialize(await loadTournament(restaurantId, match.tournament.id));
  },

  async finish(restaurantId: string, id: string) {
    const t = await loadTournament(restaurantId, id);
    if (t.status === 'FINISHED') return serialize(t);
    const updated = await prisma.clubTournament.update({
      where: { id },
      data: { status: 'FINISHED', finishedAt: new Date() },
      include: tournamentInclude,
    });
    emitToKitchen(restaurantId, SocketEvents.CLUB_TOURNAMENT_UPDATED, { id });
    return serialize(updated);
  },

  async remove(restaurantId: string, id: string) {
    await loadTournament(restaurantId, id);
    await prisma.clubTournament.delete({ where: { id } });
    emitToKitchen(restaurantId, SocketEvents.CLUB_TOURNAMENT_UPDATED, { id });
    return { ok: true };
  },

  /** Últimos torneos jugados, para consultar una tabla vieja. */
  async listFinished(restaurantId: string) {
    const list = await prisma.clubTournament.findMany({
      where: { restaurantId, status: 'FINISHED' },
      orderBy: { finishedAt: 'desc' },
      take: 20,
      include: tournamentInclude,
    });
    return list.map(serialize);
  },
};
