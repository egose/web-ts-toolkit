import { isPlainObject, set } from '@web-ts-toolkit/utils';
import { isDocument } from '../lib';

/**
 * Apply already-selected data (or trusted prepare output) at policy boundaries.
 * Only strict ancestors of allowed fields are traversed. Authorized objects and
 * arrays are replacement values, not recursive merges. Extra prepare fields are
 * trusted writes; an omitted child of a partial container is never a deletion.
 */
export function applyUpdate(target: object, data: object | null | undefined, allowedFields: string[]): void {
  const wholeFields = new Set<string>();
  const partialContainers = new Set<string>();
  const collectBoundary = (shape: object, prefix = ''): void => {
    for (const [key, value] of Object.entries(shape)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value === true) wholeFields.add(path);
      else {
        partialContainers.add(path);
        collectBoundary(value as object, path);
      }
    }
  };
  for (const field of allowedFields) {
    // Use the same path grammar as pick(), including bracket/index aliases.
    collectBoundary(set({}, field, true));
  }

  const apply = (values: object, prefix = ''): void => {
    for (const [key, value] of Object.entries(values)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (partialContainers.has(path) && !wholeFields.has(path) && (isPlainObject(value) || Array.isArray(value))) {
        apply(value as object, path);
      } else if (isDocument(target)) {
        // Document setters handle single-nested creation, casting and dirty paths.
        target.set(path, value);
      } else {
        set(target, path, value);
      }
    }
  };
  apply(data ?? {});
}
