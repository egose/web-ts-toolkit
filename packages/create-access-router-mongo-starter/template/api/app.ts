import { createExpress } from './src/express';

// Entry for the serverless bundle (`serverless` script). The DB is started by
// the cold-start init hook in `./init.ts`, not here, so this module is
// side-effect-free and safe to import.
export default createExpress();
