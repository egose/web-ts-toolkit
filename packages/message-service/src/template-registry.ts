import type { MessageTemplate } from './types/template';
import { isRuntimeError, markRuntimeError } from './runtime-contract';

export class TemplateRegistryValidationError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    return isRuntimeError(value, 'TemplateRegistryValidationError');
  }

  constructor(message: string) {
    super(message);
    this.name = 'TemplateRegistryValidationError';
    markRuntimeError(this, this.name);
  }
}

function requireNonEmptyString(value: unknown, field: string, templateCd?: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TemplateRegistryValidationError(
      `${templateCd ? `template "${templateCd}" ` : ''}${field} must be a non-empty string`,
    );
  }
  return value;
}

function validateTemplate(template: MessageTemplate): void {
  const templateCd = requireNonEmptyString(template.templateCd, 'templateCd');
  if (!Array.isArray(template.actions)) {
    throw new TemplateRegistryValidationError(`template "${templateCd}" actions must be an array`);
  }

  const seenActionCodes = new Set<string>();
  const defaultByUsertype = new Map<'sender' | 'receiver', string>();
  for (const action of template.actions) {
    const actionCd = requireNonEmptyString(action.actionCd, 'actionCd', templateCd);
    if (seenActionCodes.has(actionCd)) {
      throw new TemplateRegistryValidationError(`template "${templateCd}" has duplicate actionCd "${actionCd}"`);
    }
    seenActionCodes.add(actionCd);

    requireNonEmptyString(action.name, `action "${actionCd}" name`, templateCd);
    requireNonEmptyString(action.variant, `action "${actionCd}" variant`, templateCd);
    if (!action.sender && !action.receiver) {
      throw new TemplateRegistryValidationError(
        `template "${templateCd}" action "${actionCd}" must be available to sender or receiver`,
      );
    }

    if (action.isDefault) {
      for (const usertype of ['sender', 'receiver'] as const) {
        if (!action[usertype]) continue;
        const existingDefault = defaultByUsertype.get(usertype);
        if (existingDefault) {
          throw new TemplateRegistryValidationError(
            `template "${templateCd}" has multiple default ${usertype} actions: "${existingDefault}" and "${actionCd}"`,
          );
        }
        defaultByUsertype.set(usertype, actionCd);
      }
    }
  }
}

function snapshotTemplate(template: MessageTemplate): MessageTemplate {
  const snapshot: MessageTemplate = {
    ...template,
    senderContent: Object.freeze({ ...template.senderContent }),
    receiverContent: Object.freeze({ ...template.receiverContent }),
    uiTemplate:
      typeof template.uiTemplate === 'string' ? template.uiTemplate : Object.freeze({ ...template.uiTemplate }),
    actions: Object.freeze(
      template.actions.map((action) =>
        Object.freeze({
          ...action,
          confirmation: action.confirmation ? Object.freeze({ ...action.confirmation }) : undefined,
          payload: action.payload ? Object.freeze({ ...action.payload }) : undefined,
        }),
      ),
    ) as unknown as MessageTemplate['actions'],
  };

  return Object.freeze(snapshot);
}

/**
 * In-memory registry for trusted message-template code.
 * Templates are looked up by their `templateCd`.
 *
 * The registry validates action metadata and stores a frozen shallow snapshot of
 * authorization/action-critical structure. Function fields keep their original
 * identity, but mutating the object passed to `register()` later cannot change
 * registered action authorization or handlers accidentally.
 *
 * Recommended: create one `TemplateRegistry` per app and pass it to
 * `MessageService({ registry })`. Use the `defaultRegistry` only for
 * simple cases or quick experiments.
 */
export class TemplateRegistry {
  private templates = new Map<string, MessageTemplate>();

  /**
   * Register a template. Overwrites if templateCd already exists.
   */
  register(template: MessageTemplate): void {
    validateTemplate(template);
    this.templates.set(template.templateCd, snapshotTemplate(template));
  }

  /**
   * Register multiple templates at once.
   */
  registerAll(templates: MessageTemplate[]): void {
    for (const t of templates) {
      this.register(t);
    }
  }

  /**
   * Find a template by its templateCd.
   */
  find(templateCd: string): MessageTemplate | undefined {
    return this.templates.get(templateCd);
  }

  /**
   * Check if a template exists.
   */
  has(templateCd: string): boolean {
    return this.templates.has(templateCd);
  }

  /**
   * Get all registered template codes.
   */
  getTemplateCodes(): string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * Get all registered templates.
   */
  getAll(): MessageTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Remove a template by templateCd.
   */
  unregister(templateCd: string): boolean {
    return this.templates.delete(templateCd);
  }

  /**
   * Clear all templates.
   */
  clear(): void {
    this.templates.clear();
  }
}

/**
 * Default global registry instance.
 * Shared through `globalThis` so mixed ESM/CommonJS consumers observe one
 * registry even though Node loads each format through a separate module graph.
 */
const DEFAULT_REGISTRY_KEY = Symbol.for('@web-ts-toolkit/message-service/defaultRegistry');
const registryGlobal = globalThis as typeof globalThis & Record<symbol, unknown>;
export const defaultRegistry = (registryGlobal[DEFAULT_REGISTRY_KEY] ??= new TemplateRegistry()) as TemplateRegistry;

/**
 * Check if a given actionCd exists in a registered template.
 * Used by the Message model's archive() method.
 */
export function includesAction(templateCd: string, actionCd: string, registry: TemplateRegistry): boolean {
  const template = registry.find(templateCd);
  if (!template) return false;

  return template.actions.some((a) => a.actionCd === actionCd);
}
