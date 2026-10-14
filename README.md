# Heads Up

Ranked heads-up No-Limit Hold'em on the web, with chess-style Elo. No real money.

## Layout

- `packages/engine`: pure TypeScript game rules (dealing, betting, hand evaluation, elimination threshold, Elo), shared by server and client.
- `apps/server`, `apps/web`: coming next.

## Develop

```sh
pnpm install
pnpm test
```
