# Heads Up

Ranked heads-up No-Limit Hold'em on the web, with chess-style Elo. No real money.

## Layout

- `packages/engine`: pure TypeScript game rules (dealing, betting, hand evaluation, elimination threshold, Elo), shared by server and client.
- `apps/server`: Fastify + WebSocket game server: accounts, matchmaking queue, live tables with 30-second clocks, and Elo updates, stored in Postgres via Prisma.
- `apps/web`: coming next.

## Develop

```sh
pnpm install
pnpm test

# Run the server (in-memory store unless DATABASE_URL is set)
cp apps/server/.env.example apps/server/.env   # then edit
cd apps/server
pnpm exec prisma migrate deploy                 # if using Postgres
AUTH_SECRET=dev DEV_LOGIN=1 pnpm dev
```

Set `TEST_DATABASE_URL` to also run the Postgres store tests.

## Socket protocol

Connect to `ws://host/play?token=<jwt>`. The token is an HS256 JWT signed with `AUTH_SECRET` whose `sub` is the user id; in development, `POST /dev/login {"username"}` returns one when `DEV_LOGIN=1`.

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
