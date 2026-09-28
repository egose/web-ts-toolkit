import { port } from './domain';
import { startExampleServer } from './server';

void startExampleServer({
  onListening: () => {
    console.log(`org-access example API listening on http://localhost:${port}`);
    console.log(
      'Demo users: owner@example.com, ada@example.com, maya@example.com, sam@example.com, nora@example.com, leo@example.com, alice@example.com, bob@example.com, carol@example.com, dave@example.com, eve@example.com',
    );
  },
}).catch((error: unknown) => {
  console.error('Example startup failed:', error);
  process.exitCode = 1;
});
