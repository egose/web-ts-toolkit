import express from 'express';
import type { Core } from '../core';
import type { DataCore } from '../core-data';
import type { AccessRouterPermissions } from '../permission';
import { PERMISSIONS, PERMISSION_KEYS, MIDDLEWARE, DATA_MIDDLEWARE } from '../symbols';

export interface AccessRouterRequestExtensions {
  macl?: Core;
  dacl?: DataCore;
  [PERMISSIONS]?: AccessRouterPermissions;
  [PERMISSION_KEYS]?: string[];
  [MIDDLEWARE]?: unknown[] | unknown;
  [DATA_MIDDLEWARE]?: unknown[] | unknown;
  [key: string]: unknown;
  [key: symbol]: unknown;
}

export type AccessRouterRequest = express.Request & AccessRouterRequestExtensions;
