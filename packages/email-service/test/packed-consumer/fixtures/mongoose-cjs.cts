// eslint-disable-next-line @typescript-eslint/no-require-imports
import mongoose = require('mongoose');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import durable = require('@web-ts-toolkit/email-service/mongoose');
import type { EmailStore, SmtpCapacity } from '@web-ts-toolkit/email-service';

const connection = mongoose.createConnection();
const store: EmailStore = durable.createMongooseEmailStore(connection);
function createBoundStore(smtpCapacity: SmtpCapacity): EmailStore {
  return durable.createMongooseEmailStore(connection, { smtpCapacity });
}
export = { store, createBoundStore };
