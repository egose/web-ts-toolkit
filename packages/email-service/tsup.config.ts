import { defineConfig } from 'tsup';

export default defineConfig({
  // One invocation owns dist. Bundle internal TS so emitted Node entrypoints do
  // not depend on extensionless source specifiers or workspace paths.
  entry: {
    index: 'src/index.ts',
    smtp: 'src/smtp.ts',
    sendgrid: 'src/sendgrid.ts',
    mongoose: 'src/mongoose.ts',
  },
  clean: true,
  outDir: 'dist',
  format: ['cjs', 'esm'],
  dts: true,
  target: 'node24',
  platform: 'node',
  bundle: true,
  splitting: false,
  external: ['handlebars', 'mongoose', 'nodemailer'],
});
