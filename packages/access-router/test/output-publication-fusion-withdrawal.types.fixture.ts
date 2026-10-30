/** Installed root/advanced contract: the unshipped prototype is not a dormant API. */
import type { DefaultModelRouterOptions, ModelRouterOptions } from '@web-ts-toolkit/access-router';
import type {
  DefaultModelRouterOptions as AdvancedDefaults,
  ModelRouterOptions as AdvancedModel,
  ExtendedDefaultModelRouterOptions,
  ExtendedModelRouterOptions,
} from '@web-ts-toolkit/access-router/advanced';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type Withdrawn = 'unsafeFuseListOutputPublication' | 'unsafeFuseReadOutputPublication';
type OriginalOptions = {
  unsafeSkipListDocumentSnapshotChecks?: boolean;
  unsafeSkipReadDocumentSnapshotChecks?: boolean;
  unsafeSkipListOutputSnapshotChecks?: boolean;
  unsafeSkipReadOutputSnapshotChecks?: boolean;
  unsafeSkipListNestedDocumentSnapshotChecks?: boolean;
  unsafeSkipReadNestedDocumentSnapshotChecks?: boolean;
  unsafeSkipListInitialOutputSnapshotCopy?: boolean;
  unsafeSkipReadInitialOutputSnapshotCopy?: boolean;
};

export type WithdrawalContract = [
  Assert<Equal<Extract<Withdrawn, keyof DefaultModelRouterOptions>, never>>,
  Assert<Equal<Extract<Withdrawn, keyof ModelRouterOptions>, never>>,
  Assert<Equal<Extract<Withdrawn, keyof AdvancedDefaults>, never>>,
  Assert<Equal<Extract<Withdrawn, keyof AdvancedModel>, never>>,
  Assert<Equal<Extract<Withdrawn, keyof ExtendedDefaultModelRouterOptions>, never>>,
  Assert<Equal<Extract<Withdrawn, keyof ExtendedModelRouterOptions>, never>>,
  Assert<Equal<Pick<DefaultModelRouterOptions, keyof OriginalOptions>, OriginalOptions>>,
  Assert<Equal<Pick<ModelRouterOptions, keyof OriginalOptions>, OriginalOptions>>,
];

// @ts-expect-error unshipped LIST publication fusion is not a model option
const list: ModelRouterOptions = { unsafeFuseListOutputPublication: true };
// @ts-expect-error unshipped READ publication fusion is not a default-model option
const read: DefaultModelRouterOptions = { unsafeFuseReadOutputPublication: true };
// @ts-expect-error the advanced entrypoint cannot reintroduce LIST fusion
const advancedList: AdvancedModel = { unsafeFuseListOutputPublication: false };
// @ts-expect-error extended defaults cannot advertise dormant READ fusion
const extendedRead: ExtendedDefaultModelRouterOptions = { unsafeFuseReadOutputPublication: false };
void [list, read, advancedList, extendedRead];
