import type { TransformMatrix } from './types';

export interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export function getTransformedUnitBounds(transform: TransformMatrix): Bounds {
  const [a, b, c, d, e, f] = transform;
  const points = [
    [e, f],
    [a + e, b + f],
    [c + e, d + f],
    [a + c + e, b + d + f],
  ];
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const bottom = Math.min(...ys);
  const top = Math.max(...ys);

  return { left, right, top, bottom, width: right - left, height: top - bottom };
}
