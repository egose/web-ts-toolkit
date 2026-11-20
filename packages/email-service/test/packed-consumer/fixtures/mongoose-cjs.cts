// eslint-disable-next-line @typescript-eslint/no-require-imports
import mongoose = require('mongoose');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import durable = require('@web-ts-toolkit/email-service/mongoose');
import type { EmailStore } from '@web-ts-toolkit/email-service';

const store: EmailStore = durable.createMongooseEmailStore(mongoose.createConnection());
export = store;
