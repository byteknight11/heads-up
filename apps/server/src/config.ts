export interface Config {
  port: number;
  authSecret: string;
  databaseUrl: string | undefined;
  /** Enables POST /dev/login, which signs in by username without a password. Never set in production. */
  devLogin: boolean;
}

export function loadConfig(env = process.env): Config {
  const authSecret = env.AUTH_SECRET;
  if (!authSecret) throw new Error('AUTH_SECRET is required');
  return {
    port: Number(env.PORT ?? 8080),
    authSecret,
    databaseUrl: env.DATABASE_URL,
    devLogin: env.DEV_LOGIN === '1',
  };
}
