import { startDB } from './src/db';
import { createExpress } from './src/express';

// Entry for local development (`server` script). An async factory is supported
// by `wtt-express-runtime dev`: the CLI awaits it and serves the returned app.
export default async function startApp() {
  await startDB();
  return createExpress();
}
