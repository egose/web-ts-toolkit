import mongoose from 'mongoose';
import { afterAll, afterEach } from 'vitest';
import { cleanupTrackedChildren } from './support/subprocess';
import {
  assertNoTrackedJitiCacheArtifacts,
  assertNoTrackedTempProjects,
  cleanupSuiteJitiCacheArtifacts,
  cleanupTempProjects,
} from './support/tmp';

afterEach(async () => {
  await cleanupTrackedChildren();
  cleanupTempProjects();
  assertNoTrackedTempProjects();
  assertNoTrackedJitiCacheArtifacts();

  mongoose.deleteModel(/AccessRouterRuntime.*/);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
});

afterAll(() => {
  cleanupSuiteJitiCacheArtifacts();
  assertNoTrackedTempProjects();
  assertNoTrackedJitiCacheArtifacts();
});
