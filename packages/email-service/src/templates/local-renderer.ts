import { MESSAGE_LIMITS } from '../constants';
import type { JsonObject } from '../contracts/message';
import type { LocalSource } from '../contracts/template';
import { syncStage, type OperationBudget } from '../internal/budget';
import { requireCallback, runSyncCallback, type CallbackSlot } from '../internal/callbacks';
import { smtpParts, validateSubject } from '../internal/message-codecs';
import { invalid, ownData, plainKeys, utf8String } from '../internal/validation';
import { loadLocalSource } from './local-sources';

type Parts<T> = Readonly<{ subject: T; html?: T; text?: T }>;
type Compiler = ReturnType<typeof import('handlebars').create>;
type CompiledPart = (values: JsonObject) => string;
type Load = { readonly key: string; valid: boolean };
const RENDER_ERROR = 'template_render';

export function createLocalRenderer(cacheEntries: number, rawHelpers: unknown) {
  const code = 'invalid_config';
  const helpers = new Map<string, ReturnType<typeof requireCallback>>();
  if (rawHelpers !== undefined) {
    for (const key of plainKeys(rawHelpers, Infinity, code)) {
      if (!key || ['__proto__', 'prototype', 'constructor', 'helperMissing', 'blockHelperMissing'].includes(key)) {
        invalid(code);
      }
      helpers.set(key, requireCallback(ownData(rawHelpers as object, key, code)));
    }
  }

  const cache = new Map<string, Parts<CompiledPart>>();
  const loading = new Set<Load>();
  let environment: Compiler | undefined;
  let renderFrame: { budget: OperationBudget; slot: CallbackSlot } | undefined;

  async function getEnvironment(budget: OperationBudget): Promise<Compiler> {
    budget.check();
    if (environment) return environment;
    try {
      const { default: Handlebars } = await import('handlebars/dist/cjs/handlebars.js');
      return syncStage(budget, RENDER_ERROR, () => {
        if (environment) return environment;
        const instance = Handlebars.create();
        // The stock log helper would send arbitrary context data to the global logger.
        instance.unregisterHelper('log');
        for (const [key, helper] of helpers) {
          instance.registerHelper(key, function (this: unknown, ...args: unknown[]) {
            const frame = renderFrame;
            if (!frame) invalid(RENDER_ERROR);
            return runSyncCallback(frame.budget, frame.slot, RENDER_ERROR, () => Reflect.apply(helper, this, args));
          });
        }
        environment = instance;
        return instance;
      });
    } catch {
      budget.check();
      return invalid(RENDER_ERROR);
    }
  }

  function compile(engine: Compiler, source: string, noEscape: boolean): CompiledPart {
    const delegate = engine.compile<JsonObject>(source, { strict: true, noEscape });
    return (values) => delegate(values, { allowProtoMethodsByDefault: false, allowProtoPropertiesByDefault: false });
  }

  function renderParts(
    { subject, html, text }: Parts<CompiledPart>,
    values: JsonObject,
    budget: OperationBudget,
    slot: CallbackSlot,
  ) {
    const previous = renderFrame;
    renderFrame = { budget, slot };
    try {
      return smtpParts(
        syncStage(budget, RENDER_ERROR, () => validateSubject(subject(values), RENDER_ERROR)),
        html
          ? syncStage(budget, RENDER_ERROR, () => utf8String(html(values), MESSAGE_LIMITS.htmlBytes, RENDER_ERROR))
          : undefined,
        text
          ? syncStage(budget, RENDER_ERROR, () => utf8String(text(values), MESSAGE_LIMITS.textBytes, RENDER_ERROR))
          : undefined,
        RENDER_ERROR,
      );
    } finally {
      renderFrame = previous;
    }
  }

  return {
    invalidate(key?: string): void {
      if (key === undefined) cache.clear();
      else cache.delete(key);
      // Bounded by the registry's pending slots, not by the number of keys ever loaded/invalidated.
      for (const entry of loading) {
        if (key === undefined || key === entry.key) entry.valid = false;
      }
    },

    async render(
      key: string,
      sources: Parts<LocalSource>,
      values: JsonObject,
      budget: OperationBudget,
      slot: CallbackSlot,
    ): Promise<Parts<string>> {
      budget.check();
      // A registry copies a single immutable revision for each key, so the map key also fixes the revision.
      const hit = cache.get(key);
      if (hit) {
        cache.delete(key);
        cache.set(key, hit);
        return renderParts(hit, values, budget, slot);
      }

      const entry = { key, valid: true };
      loading.add(entry);
      try {
        const subject = await loadLocalSource(sources.subject, budget, slot);
        const html = sources.html ? await loadLocalSource(sources.html, budget, slot) : undefined;
        const text = sources.text ? await loadLocalSource(sources.text, budget, slot) : undefined;
        const engine = await getEnvironment(budget);
        const compiled = syncStage(budget, RENDER_ERROR, () => ({
          subject: compile(engine, subject, true),
          ...(html === undefined ? {} : { html: compile(engine, html, false) }),
          ...(text === undefined ? {} : { text: compile(engine, text, true) }),
        }));
        const content = renderParts(compiled, values, budget, slot); // Handlebars compiles lazily on first render.
        budget.check();
        if (entry.valid && cacheEntries > 0) {
          cache.delete(key);
          cache.set(key, compiled);
          const oldest = cache.keys().next();
          if (cache.size > cacheEntries && !oldest.done) cache.delete(oldest.value);
        }
        return content;
      } finally {
        loading.delete(entry);
      }
    },
  };
}
