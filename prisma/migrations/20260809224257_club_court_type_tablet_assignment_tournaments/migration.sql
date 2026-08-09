-- Tipo de cancha: reemplaza el booleano `indoor` por tres estados reales.
-- Las canchas que hoy están marcadas como techadas pasan a TECHADA; el resto,
-- a LIBRE. Se migra el dato ANTES de borrar la columna vieja.
CREATE TYPE "ClubCourtType" AS ENUM ('LIBRE', 'TECHADA', 'INDOOR');

ALTER TABLE "club_courts" ADD COLUMN "courtType" "ClubCourtType" NOT NULL DEFAULT 'LIBRE';
UPDATE "club_courts" SET "courtType" = 'TECHADA' WHERE "indoor" = true;
ALTER TABLE "club_courts" DROP COLUMN "indoor";

-- Tablet de cancha (rol CANCHA) atornillada a una cancha concreta.
ALTER TABLE "users" ADD COLUMN "clubCourtId" TEXT;
ALTER TABLE "users"
  ADD CONSTRAINT "users_clubCourtId_fkey"
  FOREIGN KEY ("clubCourtId") REFERENCES "club_courts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Torneos sociales (Americano / Mexicano).
CREATE TYPE "ClubTournamentFormat" AS ENUM ('AMERICANO', 'MEXICANO');
CREATE TYPE "ClubTournamentStatus" AS ENUM ('RUNNING', 'FINISHED');
CREATE TYPE "ClubTournamentScoring" AS ENUM ('POINTS', 'TIME');

CREATE TABLE "club_tournaments" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format" "ClubTournamentFormat" NOT NULL,
    "scoring" "ClubTournamentScoring" NOT NULL DEFAULT 'POINTS',
    "pointsPerMatch" INTEGER NOT NULL DEFAULT 24,
    "minutesPerRound" INTEGER NOT NULL DEFAULT 15,
    "courtNames" JSONB NOT NULL,
    "status" "ClubTournamentStatus" NOT NULL DEFAULT 'RUNNING',
    "currentRound" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "club_tournaments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "club_tournament_players" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "club_tournament_players_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "club_tournament_matches" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "courtName" TEXT NOT NULL,
    "teamAPlayer1Id" TEXT NOT NULL,
    "teamAPlayer2Id" TEXT NOT NULL,
    "teamBPlayer1Id" TEXT NOT NULL,
    "teamBPlayer2Id" TEXT NOT NULL,
    "scoreA" INTEGER,
    "scoreB" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "playedAt" TIMESTAMP(3),
    CONSTRAINT "club_tournament_matches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "club_tournaments_restaurantId_status_idx" ON "club_tournaments"("restaurantId", "status");
CREATE INDEX "club_tournament_players_tournamentId_idx" ON "club_tournament_players"("tournamentId");
CREATE INDEX "club_tournament_matches_tournamentId_round_idx" ON "club_tournament_matches"("tournamentId", "round");

ALTER TABLE "club_tournaments"
  ADD CONSTRAINT "club_tournaments_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "club_tournament_players"
  ADD CONSTRAINT "club_tournament_players_tournamentId_fkey"
  FOREIGN KEY ("tournamentId") REFERENCES "club_tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "club_tournament_matches"
  ADD CONSTRAINT "club_tournament_matches_tournamentId_fkey"
  FOREIGN KEY ("tournamentId") REFERENCES "club_tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
