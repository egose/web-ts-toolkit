import type { Document } from '@web-ts-toolkit/access-router-client';

interface Organization extends Document {
  _id?: string;
  name: string;
  status?: 'active' | 'archived';
}
