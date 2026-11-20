import { createConnection } from 'mongoose';
import type { EmailStore } from '@web-ts-toolkit/email-service';
import { createMongooseEmailStore, type MongooseEmailStoreOptions } from '@web-ts-toolkit/email-service/mongoose';

const names: MongooseEmailStoreOptions = { jobsCollection: 'SyntheticEmailJobs' };
const connection = createConnection();
export const store: EmailStore = createMongooseEmailStore(connection, names);
// @ts-expect-error the factory takes an explicit Connection, not a URI
createMongooseEmailStore('mongodb://db.invalid');
