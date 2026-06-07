import Handlebars from 'handlebars';
import type { IMessage, IMessageArchive, MessageUser } from './types/message';
import type {
  MessageTemplate,
  InterpolationResult,
  UiTemplate,
  MessageAction,
  InterpolatedAction,
  Usertype,
} from './types/template';

export type { Usertype } from './types/template';

const compiledTemplates = new Map<string, Handlebars.TemplateDelegate<Record<string, unknown>>>();

/**
 * Compile a Handlebars template string with the given data.
 * `noEscape: true` is set because messages are rendered as plain text.
 */
function compile(template: string, data: Record<string, unknown>): string {
  let compiled = compiledTemplates.get(template);
  if (!compiled) {
    compiled = Handlebars.compile(template, { noEscape: true });
    compiledTemplates.set(template, compiled);
  }
  return compiled(data);
}

/**
 * Apply the standard set of action filters (usertype match, permission, condition).
 * This is the single source of truth used by both the template engine (for UI)
 * and the server-side action handler (for authorization).
 *
 * The `name` and confirmation `title`/`message`/`notesLabel` strings are
 * compiled against the same `data` passed to `interpolateTemplate`.
 */
export function filterActions(
  actions: MessageAction[],
  usertype: Usertype,
  options: {
    permissions?: Record<string, boolean>;
    message?: Record<string, unknown>;
    data?: Record<string, unknown>;
  } = {},
): InterpolatedAction[] {
  const { permissions = {}, message = {}, data = {} } = options;

  return actions
    .filter((action) => {
      if (!action[usertype]) return false;
      if (action.permission && !permissions[action.permission]) return false;
      if (action.condition && !action.condition(message as unknown as IMessage)) return false;
      return true;
    })
    .map((action) => {
      const { confirmation } = action;
      return {
        actionCd: action.actionCd,
        isDefault: action.isDefault,
        name: compile(action.name, data),
        variant: action.variant,
        confirmation: confirmation
          ? {
              title: compile(confirmation.title, data),
              message: compile(confirmation.message, data),
              ...(confirmation.notesLabel ? { notesLabel: compile(confirmation.notesLabel, data) } : {}),
              ...(confirmation.requireNotes !== undefined ? { requireNotes: confirmation.requireNotes } : {}),
              ...(confirmation.documents !== undefined ? { documents: confirmation.documents } : {}),
            }
          : undefined,
        payload: action.payload,
      };
    });
}

/**
 * Check if the given user is allowed to execute the action on the given message.
 * Returns true if the action is permitted, false otherwise.
 * Mirrors the `filterActions` logic exactly so the UI and the server agree.
 */
export function isActionAllowed(
  action: MessageAction,
  user: MessageUser,
  message: IMessage | IMessageArchive,
  options: { permissions?: Record<string, boolean> } = {},
): boolean {
  const isReceiver = action.receiver && message.isReceiver(user);
  const isSender = action.sender && message.isSender(user);
  if (!isReceiver && !isSender) return false;
  if (action.permission && !(options.permissions || {})[action.permission]) return false;
  if (action.condition && !action.condition(message)) return false;
  return true;
}

/**
 * Interpolate a template's sender/receiver content and filter actions
 * for the given usertype (sender or receiver).
 */
export function interpolateTemplate(
  template: MessageTemplate,
  data: Record<string, unknown>,
  usertype: Usertype,
  options: {
    permissions?: Record<string, boolean>;
    message?: Record<string, unknown>;
  } = {},
): InterpolationResult {
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
    actions: filterActions(actions, usertype, { permissions, message, data }),
  };
}

function resolveUiTemplate(uiTemplate: UiTemplate, usertype: Usertype): string {
  if (typeof uiTemplate === 'string') return uiTemplate;
  return uiTemplate[usertype] || uiTemplate.sender || uiTemplate.receiver || '';
}
