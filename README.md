# Heads Up

Ranked heads-up No-Limit Hold'em on the web, with chess-style Elo. No real money.

## Layout

- `packages/engine`: pure TypeScript game rules (dealing, betting, hand evaluation, elimination threshold, Elo), shared by server and client.
- `apps/server`: Fastify + WebSocket game server: accounts, matchmaking queue, live tables with 30-second clocks, and Elo updates, stored in Postgres via Prisma.
- `apps/web`: Next.js client: sign-in (Google, plus username sign-in for local development), lobby and queue, the playable table, and profiles with rating history.

## Develop

```sh
pnpm install
pnpm test

# Play locally: game server on :8080, web app on :3000
cd apps/server && AUTH_SECRET=dev DEV_LOGIN=1 pnpm dev
cd apps/web && cp .env.example .env.local && pnpm dev   # set AUTH_SECRET=dev in .env.local
# Open http://localhost:3000 in two browser windows (one private) and sign in as two users.

# With Postgres instead of the in-memory store
cd apps/server && DATABASE_URL=postgresql://... pnpm exec prisma migrate deploy
```

Set `TEST_DATABASE_URL` to also run the Postgres store tests.

## Socket protocol

Connect to `ws://host/play?token=<jwt>`. The token is an HS256 JWT signed with `AUTH_SECRET` whose `sub` is the player's email and `name` their display name (the web app issues it at `/api/token`; the server creates new players on first connect). In development, `POST /dev/login {"username"}` returns one when `DEV_LOGIN=1`.

| Direction | Message | Payload |
| --- | --- | --- |
| Client to server | `queue.join`, `queue.leave`, `resign` | |
| Client to server | `action` | `{ type: fold \| check \| call \| bet \| raise \| allin, amount? }` |
| Server to client | `hello` | Your user and rating |
| Server to client | `match.found` | Game id, your seat, opponent |
| Server to client | `hand.start`, `state`, `hand.end` | Your view of the table; `state` also carries the clock deadline |
| Server to client | `game.end` | Result, outcome, rating change, new rating |
| Server to client | `error` | Message |

`GET /users/:id` returns a profile and rating history.
