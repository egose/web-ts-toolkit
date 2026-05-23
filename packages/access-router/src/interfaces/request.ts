import express from 'express';
import type { Core } from '../core';
import type { DataCore } from '../core-data';

export interface AccessRouterRequestExtensions {
  macl?: Core;
  dacl?: DataCore;
}

export type AccessRouterRequest = express.Request & AccessRouterRequestExtensions;
