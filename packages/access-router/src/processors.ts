import castArray from 'lodash/castArray';
import cloneDeep from 'lodash/cloneDeep';
import forEach from 'lodash/forEach';
import get from 'lodash/get';
import isArray from 'lodash/isArray';
import map from 'lodash/map';
import set from 'lodash/set';

interface ProcessCopy {
  src: string;
  dest: string;
}

interface CopyAndDepopulateOptions {
  mutable?: boolean;
  idField?: string;
}

export const copyAndDepopulate = <T extends object>(
  docObject: T,
  operations: ProcessCopy[],
  options: CopyAndDepopulateOptions = { mutable: true, idField: '_id' },
) => {
  const obj = (get(options, 'mutable', true) ? docObject : cloneDeep(docObject)) as T;
  const idField = get(options, 'idField', '_id');

  forEach(castArray<ProcessCopy>(operations), (op) => {
    if (!op.src || !op.dest) return;

    let targets: unknown[] = [obj];
    const segs = op.src.split('.');
    forEach<string>(segs, (seg, ind) => {
      if (segs.length === ind + 1) {
        forEach(targets, (target) => {
          const targetObject = target as Record<string, unknown>;
          set(targetObject, op.dest, get(targetObject, seg));
          set(
            targetObject,
            seg,
            isArray(targetObject[seg]) ? map(targetObject[seg], idField) : get(targetObject, `${seg}.${idField}`),
          );
        });
      } else {
        targets = targets.reduce<unknown[]>((ret, target) => {
          const targetObject = target as Record<string, unknown>;
          if (isArray(targetObject[seg])) ret.push(...targetObject[seg]);
          else ret.push(targetObject[seg]);

          return ret;
        }, []);
      }
    });
  });

  return obj;
};
