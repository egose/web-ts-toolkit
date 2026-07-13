import { startDB } from './src/db';

// Cold-start init hook for the serverless bundle. Memoized per warm instance by
// `createServerlessHandler`, so the in-memory database spins up once per cold
// start and persists across warm invocations.
export default startDB;
