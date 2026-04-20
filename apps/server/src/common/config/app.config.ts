export const appConfig = () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  appName: process.env.APP_NAME ?? 'CloudTodo Server',
  port: Number(process.env.PORT ?? 3000),
  appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:3000',
});
