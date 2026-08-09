/**
 * ============================================================================
 *  Generación de cruces de un torneo social de pádel
 * ============================================================================
 *  En un torneo social se compite INDIVIDUALMENTE aunque se juegue en parejas:
 *  cada ronda te toca un compañero distinto y los puntos que anota tu pareja
 *  son tuyos. Lo que cambia entre formatos es cómo se deciden esas parejas.
 *
 *  - AMERICANO: se busca que juegues con y contra la mayor cantidad de gente
 *    posible. No hay una fórmula cerrada para cualquier número de jugadores y
 *    canchas, así que se resuelve con un reparto voraz que penaliza repetir
 *    compañero (fuerte) y repetir rival (suave).
 *
 *  - MEXICANO: los cruces salen de la tabla. Se ordena por puntos y se agrupa
 *    de a cuatro: 1º+4º contra 2º+3º. Los que van ganando se enfrentan entre
 *    sí ronda tras ronda.
 *
 *  Cuando no alcanzan las canchas para todos, descansa quien MENOS partidos
 *  lleva jugados — en los dos formatos, para que el descanso rote solo.
 * ============================================================================
 */

export interface PairingPlayer {
  id: string;
  /** Desempate estable: el orden en que se cargaron los jugadores. */
  sortOrder: number;
}

export interface PlayedMatch {
  teamAPlayer1Id: string;
  teamAPlayer2Id: string;
  teamBPlayer1Id: string;
  teamBPlayer2Id: string;
}

/** Un cruce generado: [compañero A1, compañero A2] contra [B1, B2]. */
export interface GeneratedMatch {
  teamAPlayer1Id: string;
  teamAPlayer2Id: string;
  teamBPlayer1Id: string;
  teamBPlayer2Id: string;
  courtName: string;
}

type CountMap = Map<string, Map<string, number>>;

function bump(map: CountMap, a: string, b: string): void {
  if (!map.has(a)) map.set(a, new Map());
  if (!map.has(b)) map.set(b, new Map());
  map.get(a)!.set(b, (map.get(a)!.get(b) ?? 0) + 1);
  map.get(b)!.set(a, (map.get(b)!.get(a) ?? 0) + 1);
}

function countOf(map: CountMap, a: string, b: string): number {
  return map.get(a)?.get(b) ?? 0;
}

/** Historial acumulado: con quién jugaste, contra quién, y cuántos partidos llevas. */
export function buildHistory(played: PlayedMatch[]) {
  const partners: CountMap = new Map();
  const opponents: CountMap = new Map();
  const gamesPlayed = new Map<string, number>();

  for (const m of played) {
    const a = [m.teamAPlayer1Id, m.teamAPlayer2Id];
    const b = [m.teamBPlayer1Id, m.teamBPlayer2Id];
    bump(partners, a[0], a[1]);
    bump(partners, b[0], b[1]);
    for (const x of a) for (const y of b) bump(opponents, x, y);
    for (const p of [...a, ...b]) gamesPlayed.set(p, (gamesPlayed.get(p) ?? 0) + 1);
  }

  return { partners, opponents, gamesPlayed };
}

/**
 * Quiénes juegan esta ronda. Caben `courts * 4` jugadores; si sobran, descansan
 * los que MÁS partidos llevan (así el que viene descansando entra sí o sí).
 * El desempate por `sortOrder` mantiene el resultado estable y reproducible —
 * nada de Math.random(), que haría imposible repetir un caso al depurar.
 */
function selectPlaying(players: PairingPlayer[], courts: number, gamesPlayed: Map<string, number>): PairingPlayer[] {
  const capacity = Math.min(players.length - (players.length % 4), courts * 4);
  return [...players]
    .sort((x, y) => {
      const dx = (gamesPlayed.get(x.id) ?? 0) - (gamesPlayed.get(y.id) ?? 0);
      return dx !== 0 ? dx : x.sortOrder - y.sortOrder;
    })
    .slice(0, capacity);
}

/**
 * Reparto voraz del Americano. Toma al jugador con menos partidos, le busca el
 * compañero con el que menos jugó, y luego la pareja rival que menos se haya
 * cruzado con los dos. Repetir compañero pesa el doble que repetir rival: en un
 * social molesta mucho más volver a jugar con el mismo que contra el mismo.
 */
function buildAmericanoMatches(
  playing: PairingPlayer[],
  partners: CountMap,
  opponents: CountMap,
): [string, string, string, string][] {
  const pool = [...playing];
  const matches: [string, string, string, string][] = [];

  while (pool.length >= 4) {
    const a = pool.shift()!;

    // Compañero: el que menos veces jugó con `a`.
    pool.sort((x, y) => {
      const d = countOf(partners, a.id, x.id) - countOf(partners, a.id, y.id);
      return d !== 0 ? d : x.sortOrder - y.sortOrder;
    });
    const b = pool.shift()!;

    // Rivales: la pareja que menos se repite, mirando también que ellos dos no
    // hayan sido compañeros hace nada.
    let best: { i: number; j: number; cost: number } | null = null;
    for (let i = 0; i < pool.length; i += 1) {
      for (let j = i + 1; j < pool.length; j += 1) {
        const c = pool[i];
        const d = pool[j];
        const cost =
          countOf(partners, c.id, d.id) * 2 +
          countOf(opponents, a.id, c.id) +
          countOf(opponents, a.id, d.id) +
          countOf(opponents, b.id, c.id) +
          countOf(opponents, b.id, d.id);
        if (!best || cost < best.cost) best = { i, j, cost };
      }
    }
    if (!best) break;

    const c = pool[best.i];
    const d = pool[best.j];
    // Se quita primero el índice mayor: si no, el splice de arriba corre al otro.
    pool.splice(best.j, 1);
    pool.splice(best.i, 1);

    matches.push([a.id, b.id, c.id, d.id]);
    bump(partners, a.id, b.id);
    bump(partners, c.id, d.id);
    for (const x of [a.id, b.id]) for (const y of [c.id, d.id]) bump(opponents, x, y);
  }

  return matches;
}

/**
 * Mexicano: se ordena a los que juegan por posición en la tabla y se agrupa de
 * a cuatro. Dentro del grupo, 1º+4º contra 2º+3º — el clásico, que empareja las
 * fuerzas dentro del partido.
 */
function buildMexicanoMatches(
  playing: PairingPlayer[],
  standingsOrder: string[],
): [string, string, string, string][] {
  const rank = new Map(standingsOrder.map((id, i) => [id, i]));
  const ordered = [...playing].sort((x, y) => {
    const dx = (rank.get(x.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(y.id) ?? Number.MAX_SAFE_INTEGER);
    return dx !== 0 ? dx : x.sortOrder - y.sortOrder;
  });

  const matches: [string, string, string, string][] = [];
  for (let i = 0; i + 3 < ordered.length; i += 4) {
    const [p1, p2, p3, p4] = ordered.slice(i, i + 4);
    matches.push([p1.id, p4.id, p2.id, p3.id]);
  }
  return matches;
}

/**
 * Genera los cruces de la próxima ronda.
 *
 * @param standingsOrder Ids ordenados por posición (solo lo usa el Mexicano).
 *   En la primera ronda va vacío y el orden de carga hace de siembra.
 */
export function generateRound(
  format: 'AMERICANO' | 'MEXICANO',
  players: PairingPlayer[],
  courtNames: string[],
  played: PlayedMatch[],
  standingsOrder: string[],
): GeneratedMatch[] {
  const { partners, opponents, gamesPlayed } = buildHistory(played);
  const playing = selectPlaying(players, courtNames.length, gamesPlayed);

  const pairs =
    format === 'AMERICANO'
      ? buildAmericanoMatches(playing, partners, opponents)
      : buildMexicanoMatches(playing, standingsOrder);

  return pairs.map(([a1, a2, b1, b2], i) => ({
    teamAPlayer1Id: a1,
    teamAPlayer2Id: a2,
    teamBPlayer1Id: b1,
    teamBPlayer2Id: b2,
    courtName: courtNames[i] ?? courtNames[courtNames.length - 1],
  }));
}
