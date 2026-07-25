import { resolve as pathResolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createJiti } from 'jiti';
import type { AccessRouterRuntimeConfig } from './index';

type ConfigModule = {
  default?: AccessRouterRuntimeConfig | (() => AccessRouterRuntimeConfig);
  config?: AccessRouterRuntimeConfig;
};

const jiti = createJiti(pathToFileURL(pathResolve(process.cwd(), '.access-router-runtime.config.js')).href, {
  interopDefault: true,
});

function normalizeConfigExport(raw: unknown, configPath: string): AccessRouterRuntimeConfig {
  const moduleValue = raw as ConfigModule;
  const exported = moduleValue?.default ?? moduleValue?.config ?? raw;
  const config = typeof exported === 'function' ? exported() : exported;

  if (!config || typeof config !== 'object') {
    throw new Error(`Config module "${configPath}" must export a config object or a function returning one.`);
  }

  return config as AccessRouterRuntimeConfig;
}

export function loadAccessRouterRuntimeConfigSync(configPath: string): AccessRouterRuntimeConfig {
  const fullPath = pathResolve(process.cwd(), configPath);
  return normalizeConfigExport(jiti(fullPath), configPath);
}
