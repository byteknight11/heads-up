-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('active', 'finished', 'aborted');

-- CreateEnum
CREATE TYPE "GameResult" AS ENUM ('player1_win', 'player2_win', 'draw');

-- CreateEnum
CREATE TYPE "EndReason" AS ENUM ('threshold', 'forfeit', 'draw');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 1200,
    "games_played" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" UUID NOT NULL,
    "player1_id" UUID NOT NULL,
    "player2_id" UUID NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'active',
    "result" "GameResult",
    "end_reason" "EndReason",
    "hands_played" INTEGER NOT NULL DEFAULT 0,
    "player1_rating_before" INTEGER NOT NULL,
    "player2_rating_before" INTEGER NOT NULL,
    "player1_rating_change" INTEGER,
    "player2_rating_change" INTEGER,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hands" (
    "id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "button_player_id" UUID NOT NULL,
    "hole_cards" JSONB NOT NULL,
    "board" TEXT[],
    "actions" JSONB NOT NULL,
    "player1_stack_after" INTEGER NOT NULL,
    "player2_stack_after" INTEGER NOT NULL,

    CONSTRAINT "hands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "games_player1_id_idx" ON "games"("player1_id");

-- CreateIndex
CREATE INDEX "games_player2_id_idx" ON "games"("player2_id");

-- CreateIndex
CREATE UNIQUE INDEX "hands_game_id_number_key" ON "hands"("game_id", "number");

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_player1_id_fkey" FOREIGN KEY ("player1_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_player2_id_fkey" FOREIGN KEY ("player2_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hands" ADD CONSTRAINT "hands_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

