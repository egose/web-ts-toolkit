import Handlebars from 'handlebars';
import type { IMessage } from './types/message';
import type { MessageTemplate, InterpolationResult, UiTemplate } from './types/template';

/**
 * Compile a Handlebars template string with the given data.
 */
function compile(template: string, data: Record<string, unknown>): string {
  return Handlebars.compile(template, { noEscape: true })(data);
}

/**
 * Interpolate a template's sender/receiver content and filter actions
 * for the given usertype (sender or receiver).
 */
export function interpolateTemplate(
  template: MessageTemplate,
  data: Record<string, unknown>,
  usertype: 'sender' | 'receiver',
  options: {
    permissions?: Record<string, boolean>;
    message?: Record<string, unknown>;
  } = {},
): InterpolationResult | null {
  if (!template) return null;

  const { permissions = {}, message = {} } = options;
  const { senderContent, receiverContent, actions, uiTemplate } = template;

  return {
    senderContent: {
      title: compile(senderContent?.title || '', data),
      long: compile(senderContent?.long || '', data),
      short: compile(senderContent?.short || '', data),
    },
    receiverContent: {
      title: compile(receiverContent?.title || '', data),
      long: compile(receiverContent?.long || '', data),
      short: compile(receiverContent?.short || '', data),
    },
    uiTemplate: resolveUiTemplate(uiTemplate, usertype),
    actions: actions
      .filter((action) => {
        let match = action[usertype];
        if (match && action.permission) {
          match = !!permissions[action.permission];
        }
        if (match && action.condition) {
          match = action.condition(message as unknown as IMessage);
        }
        return match;
      })
      .map(({ actionCd, isDefault, name, variant, confirmation, payload }) => ({
        actionCd,
        isDefault,
        name,
        variant,
        confirmation,
        payload,
      })),
  };
}

/**
 * Resolve the UI template string for a given usertype.
 */
function resolveUiTemplate(uiTemplate: UiTemplate, usertype: 'sender' | 'receiver'): string {
  if (typeof uiTemplate === 'string') return uiTemplate;
  return uiTemplate[usertype] || uiTemplate.sender || uiTemplate.receiver || '';
}
