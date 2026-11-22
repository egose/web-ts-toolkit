import { defineConfig } from 'tsup';

export default defineConfig({
  // One invocation owns dist. Bundle internal TS so emitted Node entrypoints do
  // not depend on extensionless source specifiers or workspace paths.
  entry: {
    index: 'src/index.ts',
    smtp: 'src/smtp.ts',
    sendgrid: 'src/sendgrid.ts',
    mongoose: 'src/mongoose.ts',
    attachments: 'src/attachments.ts',
    'attachments-mongoose': 'src/attachments/mongoose.ts',
    'attachments-s3': 'src/attachments/s3.ts',
    'attachments-azure': 'src/attachments/azure.ts',
  },
  clean: true,
  outDir: 'dist',
  format: ['cjs', 'esm'],
  dts: true,
  target: 'node24',
  platform: 'node',
  bundle: true,
  splitting: false,
  external: ['handlebars', 'mongoose', 'nodemailer', '@aws-sdk/client-s3', '@azure/storage-blob'],
});
