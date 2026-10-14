# Game server (apps/server) for Fly.io. Build from the repo root.
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter @heads-up/server...
WORKDIR /app/apps/server
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
# Apply pending database migrations, then start.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm start"]
