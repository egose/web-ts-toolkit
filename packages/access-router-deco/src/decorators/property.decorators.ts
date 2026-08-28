import 'reflect-metadata';
import type {
  ExtendedDefaultModelRouterOptions,
  ExtendedModelRouterOptions,
  GlobalOptions,
} from '@web-ts-toolkit/access-router';
import { OPTIONS_METADATA } from '../constants';

type OptionMetadata = { optionKey: string | symbol; propertyKey: string | symbol };

function createOptionDecorator(optionKey?: string | symbol): PropertyDecorator {
  return (target: object, propertyKey: string | symbol): void => {
    const opts = (Reflect.getOwnMetadata(OPTIONS_METADATA, target) || []) as OptionMetadata[];
    const nextOptionKey = optionKey || propertyKey;
    Reflect.defineMetadata(
      OPTIONS_METADATA,
      opts
        .filter((opt) => opt.propertyKey !== propertyKey && opt.optionKey !== nextOptionKey)
        .concat({ optionKey: nextOptionKey, propertyKey }),
      target,
    );
  };
}

/**
 * Legacy unscoped property decorator that copies a class property value onto runtime options during bootstrap.
 * Valid class roles: any class that participates in bootstrap — `@Module` (global), `@RouterOptions` default/model, or `@Router` model — the effective target (`globalOptions`, `defaultModelOptions`, `modelOptions`) is determined by the class's own decorator role. Property value is read after construction and written via `setGlobalOption` / `setDefaultModelOption` / `setModelOption`. Prefer scoped `GlobalOption` / `ModelOption` / `DefaultModelOption` for typed keys. Explicit — undecorated properties are not copied.
 *
 * @param optionKey - option key to set (defaults to property name). Be aware build-time keys like `basePath`, `parentPath`, `idParam` must be set before route construction.
 */
export function Option(optionKey?: string): PropertyDecorator {
  return createOptionDecorator(optionKey);
}

/**
 * Scoped property decorator for global options (`GlobalOptions`).
 * Valid class role: `@Module`-decorated module class (applied via `runtime.setGlobalOption` before any router construction). Not valid on `@Router` or `@RouterOptions` for model-specific keys. Use the generic `K` to get typed option keys (`requestPermissionField`, etc.). Explicit — undecorated properties are ignored.
 *
 * @param optionKey - global option key (defaults to property name).
 */
export function GlobalOption<K extends Extract<keyof GlobalOptions, string | symbol>>(
  optionKey?: K,
): PropertyDecorator {
  return createOptionDecorator(optionKey);
}

/**
 * Scoped property decorator for model-specific router options (`ExtendedModelRouterOptions`).
 * Valid class roles: `@Router(Model)` and `@RouterOptions(Model)` model-specific classes (applied via `runtime.setModelOption`). Not valid on default options or `@Module` for global keys. Precedence after default/model decorator options. Explicit.
 *
 * @param optionKey - model router option key (defaults to property name), e.g., `basePath`, `idParam`, `queryRouteSegment`.
 */
export function ModelOption<K extends Extract<keyof ExtendedModelRouterOptions, string | symbol>>(
  optionKey?: K,
): PropertyDecorator {
  return createOptionDecorator(optionKey);
}

/**
 * Scoped property decorator for default model options (`ExtendedDefaultModelRouterOptions`).
 * Valid class role: `@RouterOptions` with default (one-arg) options only (applied via `runtime.setDefaultModelOption`). Not valid on `@Router` or per-model providers. Explicit.
 *
 * @param optionKey - default model option key (defaults to property name).
 */
export function DefaultModelOption<K extends Extract<keyof ExtendedDefaultModelRouterOptions, string | symbol>>(
  optionKey?: K,
): PropertyDecorator {
  return createOptionDecorator(optionKey);
}
