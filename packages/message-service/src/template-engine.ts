import Handlebars from 'handlebars';
import type { IMessage, IMessageArchive, MessageUser } from './types/message';
import type {
  MessageTemplate,
  RegisteredMessageAction,
  RegisteredMessageTemplate,
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
 * `noEscape: true` is set because rendered message values are plain text, not
 * HTML. Templates are trusted application code. Any HTML renderer must escape
 * the returned strings before insertion into markup.
 *
 * The process-local cache is intentionally finite-static: template strings are
 * expected to come from registered application templates, not caller-generated
 * dynamic input. Do not pass unbounded per-request template strings here.
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
 * Single explicit permission predicate shared by every permission boundary:
 * UI filtering (`filterActions`), action execution (`isActionAllowed`), and
 * the route's admin read-only lookup.
 *
 * A grant requires an **own** property of the permissions map whose value is
 * strictly `true`. Inherited properties (e.g. `constructor`, `toString`,
 * or custom keys from a prototype chain — including the default
 * `Object.prototype`) are denied, as are truthy non-booleans (`1`, `"true"`,
 * `{}`, ...), `false`, and absent keys.
 *
 * Normal object literals and null-prototype maps (`Object.create(null)`,
 * including JSON-parsed or `Object.assign`-built maps with own properties)
 * both work: the check uses `Object.prototype.hasOwnProperty.call`, so it is
 * safe for maps containing a `__proto__` key and for maps without a
 * prototype. Non-object permission containers (`null`, `undefined`,
 * primitives, arrays) never grant.
 *
 * Tightening note for custom `getPermissions` extractors: extractors that
 * previously relied on inherited or truthy non-boolean values must now return
 * own properties set to boolean `true`; anything else is treated as denied.
 */
export function hasExplicitPermissionGrant(
  permissions: Record<string, boolean> | undefined | null,
  key: string,
): boolean {
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) return false;
  if (typeof key !== 'string' || key.length === 0) return false;
  if (!Object.prototype.hasOwnProperty.call(permissions, key)) return false;
  return (permissions as Record<string, unknown>)[key] === true;
}

/**
 * Render sender/receiver content only, without evaluating action predicates.
 *
 * Creation uses this path with `PrepareResult.templateData`: content is a
 * function of preparation output only. Action `condition` predicates are never
 * invoked here, so a condition that accesses persisted message fields (e.g.
 * `message.payload.ready`) cannot fail creation. Action labels/confirmations
 * are a separate concern rendered from persisted `message.payload` at listing
 * time (see `filterActions`); there is deliberately no unified
 * interpolation-data feature.
 *
 * Escaping/trusted-template semantics match `interpolateTemplate`: Handlebars
 * with `noEscape: true`, plain-text output, trusted template strings only.
 */
export function interpolateMessageContent(
  template: Pick<MessageTemplate | RegisteredMessageTemplate, 'senderContent' | 'receiverContent'>,
  data: Record<string, unknown>,
): Pick<InterpolationResult, 'senderContent' | 'receiverContent'> {
  const { senderContent, receiverContent } = template;
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
  };
}

/**
 * Resolve the uiTemplate for a usertype without evaluating actions.
 * Read-only/admin/archive listings use this plus an empty action list so
 * `condition` functions are never invoked merely to discard their results.
 *
 * Accepts both mutable author inputs and frozen registry views.
 */
export function resolveUiTemplate(
  uiTemplate: UiTemplate | RegisteredMessageTemplate['uiTemplate'],
  usertype: Usertype,
): string {
  if (typeof uiTemplate === 'string') return uiTemplate;
  return uiTemplate[usertype] || uiTemplate.sender || uiTemplate.receiver || '';
}

/**
 * Apply the standard set of action filters (usertype match, permission, condition).
 * This is the single source of truth used by both the template engine (for UI)
 * and the server-side action handler (for authorization).
 *
 * Permission gating uses {@link hasExplicitPermissionGrant}: only an own
 * property strictly equal to `true` grants access.
 *
 * The `name` and confirmation `title`/`message`/`notesLabel` strings are
 * compiled against the persisted `message.payload` snapshot passed as `data`
 * by `getActions` (via `interpolateTemplate`). This is intentionally different
 * from message content, which is rendered at creation time from
 * `PrepareResult.templateData`. Missing values in either source render as
 * empty strings via Handlebars.
 */
export function filterActions(
  actions: readonly (MessageAction | RegisteredMessageAction)[],
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
      if (action.permission && !hasExplicitPermissionGrant(permissions, action.permission)) return false;
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
 *
 * Permission gating uses {@link hasExplicitPermissionGrant}: only an own
 * property strictly equal to `true` grants access.
 */
export function isActionAllowed(
  action: MessageAction | RegisteredMessageAction,
  user: MessageUser,
  message: IMessage | IMessageArchive,
  options: { permissions?: Record<string, boolean> } = {},
): boolean {
  const isReceiver = action.receiver && message.isReceiver(user);
  const isSender = action.sender && message.isSender(user);
  if (!isReceiver && !isSender) return false;
  if (action.permission && !hasExplicitPermissionGrant(options.permissions, action.permission)) return false;
  if (action.condition && !action.condition(message as IMessage)) return false;
  return true;
}

/**
 * Interpolate a template's sender/receiver content and filter actions
 * for the given usertype (sender or receiver).
 *
 * Preserved public combined helper: content is rendered from `data`
 * (callers pass `templateData` at creation via `interpolateMessageContent`,
 * or persisted `message.payload` at listing time), while action predicates
 * receive the documented `message` context and action labels/confirmations
 * compile against `data`. Creation and read-only/admin/archive paths must use
 * `interpolateMessageContent`/`resolveUiTemplate` directly so conditions are
 * not evaluated unnecessarily.
 */
export function interpolateTemplate(
  template: MessageTemplate | RegisteredMessageTemplate,
  data: Record<string, unknown>,
  usertype: Usertype,
  options: {
    permissions?: Record<string, boolean>;
    message?: Record<string, unknown>;
  } = {},
): InterpolationResult {
  const { permissions = {}, message = {} } = options;
  const { actions, uiTemplate } = template;

  return {
    ...interpolateMessageContent(template, data),
    uiTemplate: resolveUiTemplate(uiTemplate, usertype),
    actions: filterActions(actions, usertype, { permissions, message, data }),
  };
}
