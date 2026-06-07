import type { MessageTemplate } from './types/template';

/**
 * In-memory registry for message templates.
 * Templates are looked up by their `templateCd`.
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
    this.templates.set(template.templateCd, template);
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
 */
export const defaultRegistry = new TemplateRegistry();

/**
 * Check if a given actionCd exists in a registered template.
 * Used by the Message model's archive() method.
 */
export function includesAction(templateCd: string, actionCd: string, registry: TemplateRegistry): boolean {
  const template = registry.find(templateCd);
  if (!template) return false;

  return template.actions.some((a) => a.actionCd === actionCd);
}
