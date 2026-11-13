/** Native/stage observations below the public-contract layer; never a source certificate. */
import mongoose from 'mongoose';
import { afterEach, vi } from 'vitest';
import type { DocumentGrants } from '../../../src/interfaces';
import * as stages from '../../../src/acl/document-stage';
import type { AuthorizationBinding, ResolvedServiceAuthorization } from '../../../src/acl/service-authorization';
import {
  closeOutputPublication,
  outputPublicationFor,
  type OutputPublication,
} from '../../../src/acl/output-publication';
import type { writeOutputFixture } from './write-output-test-fixture';

type Fixture = ReturnType<typeof writeOutputFixture>;
const owners = new Set<OutputPublication>();

afterEach(async () => {
  for (const owner of owners) await closeOutputPublication(owner).catch(() => {});
  owners.clear();
});

export interface InputStageObservation {
  authorization: ResolvedServiceAuthorization;
  binding: AuthorizationBinding;
  stage: stages.DocumentStage;
  source: Record<string, any>;
  readyFacts?: DocumentGrants;
  cleared: boolean;
}

/** Delegate unchanged. Capture only the parent admitted by the actual input resolver. */
export function observeInputStages(f: Fixture): InputStageObservation[] {
  const observations: InputStageObservation[] = [];
  const create = stages.createDocumentStage;
  const close = stages.closeDocumentStage;
  vi.spyOn(stages, 'createDocumentStage').mockImplementation((authorization, binding, input, owning) => {
    if (input === f.stored) owners.add(outputPublicationFor(authorization));
    const stage = create(authorization, binding, input, owning);
    if (input === f.stored)
      observations.push({
        authorization,
        binding,
        stage,
        source: stages.documentStageSource(stage, binding),
        cleared: false,
      });
    return stage;
  });
  vi.spyOn(stages, 'closeDocumentStage').mockImplementation((stage, error, clear) => {
    const observation = observations.find((entry) => entry.stage === stage);
    if (observation && clear) {
      try {
        observation.readyFacts = stages.readDocumentStage(stage, observation.binding).grants;
      } catch {
        // A failed/poisoned stage is already closed and must have no ready facts.
      }
      observation.cleared = true;
    }
    close(stage, error, clear);
  });
  return observations;
}

/** Keep real source/view/native work. The wrapper only labels its synchronous scope. */
export function observeInputNative(
  f: Fixture,
  options: {
    failAt?: 'prewrite.source' | 'prewrite.view';
    onObservation?: (event: string, receiver: object) => void;
  } = {},
) {
  const prototype = mongoose.mongo.BSON.Code.prototype;
  const previous = Object.getOwnPropertyDescriptor(prototype, 'toBSON');
  const events: string[] = [];
  const receivers: object[] = [];
  const original = new mongoose.mongo.BSON.Code('return 1', { value: 1 });
  f.stored.set('payload.code', original);
  let inView = false;
  const resolve = stages.resolveDocumentStage;
  const scope = vi.spyOn(stages, 'resolveDocumentStage').mockImplementation((...args) => {
    const previousScope = inView;
    inView = true;
    try {
      return resolve(...args);
    } finally {
      inView = previousScope;
    }
  });
  Object.defineProperty(prototype, 'toBSON', {
    configurable: true,
    value: function (this: object) {
      const event = `${f.saves.mock.calls.length === 0 ? 'prewrite' : 'postwrite'}.${inView ? 'view' : 'source'}`;
      events.push(event);
      receivers.push(this);
      options.onObservation?.(event, this);
      if (event === options.failAt) throw new Error('input native observation failed');
      return this;
    },
  });
  return {
    events,
    receivers,
    original,
    restore() {
      if (previous) Object.defineProperty(prototype, 'toBSON', previous);
      else Reflect.deleteProperty(prototype, 'toBSON');
      scope.mockRestore();
    },
  };
}
