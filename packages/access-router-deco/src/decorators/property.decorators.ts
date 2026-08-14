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

export function Option(optionKey?: string): PropertyDecorator {
  return createOptionDecorator(optionKey);
}

export function GlobalOption<K extends Extract<keyof GlobalOptions, string | symbol>>(
  optionKey?: K,
): PropertyDecorator {
  return createOptionDecorator(optionKey);
}

export function ModelOption<K extends Extract<keyof ExtendedModelRouterOptions, string | symbol>>(
  optionKey?: K,
): PropertyDecorator {
  return createOptionDecorator(optionKey);
}

export function DefaultModelOption<K extends Extract<keyof ExtendedDefaultModelRouterOptions, string | symbol>>(
  optionKey?: K,
): PropertyDecorator {
  return createOptionDecorator(optionKey);
}
