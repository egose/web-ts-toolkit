import { describe, it, expect, beforeEach } from 'vitest';
import {
  TemplateRegistry,
  TemplateRegistryValidationError,
  defaultRegistry,
  includesAction,
} from '../src/template-registry';
import { interpolateTemplate, filterActions, isActionAllowed } from '../src/template-engine';
import type { MessageTemplate } from '../src/types/template';

// ---------------------------------------------------------------------------
// Test template
// ---------------------------------------------------------------------------

const testTemplate: MessageTemplate = {
  templateCd: 'test-request',
  type: 'request',
  description: 'A test request template',
  senderContent: {
    title: 'Test Request',
    long: 'You submitted a request for "{{itemName}}".',
    short: 'Request for {{itemName}}',
  },
  receiverContent: {
    title: 'Test Request',
    long: '"{{displayName}}" submitted a request for "{{itemName}}".',
    short: '{{displayName}} requested {{itemName}}',
  },
  uiTemplate: 'default-message',
  paymentRequired: false,
  daysToArchive: 14,
  prepareMessage: async ({ user, payload }) => ({
    templateData: {
      displayName: (user as any).displayName,

      itemName: (payload as any).itemName,
    },

    fromUser: (user as any)._id,
    payload,
  }),
  actions: [
    {
      actionCd: 'approved',
      name: 'Approve',
      variant: 'success',
      isDefault: true,
      sender: false,
      receiver: true,
      runHandler: async () => true,
    },
    {
      actionCd: 'rejected',
      name: 'Reject',
      variant: 'danger',
      isDefault: false,
      sender: false,
      receiver: true,
      runHandler: async () => true,
    },
    {
      actionCd: 'revoked',
      name: 'Revoke',
      variant: 'danger',
      isDefault: true,
      sender: true,
      receiver: false,
      runHandler: async () => true,
    },
  ],
};

// ---------------------------------------------------------------------------
// TemplateRegistry
// ---------------------------------------------------------------------------

describe('TemplateRegistry', () => {
  let registry: TemplateRegistry;

  beforeEach(() => {
    registry = new TemplateRegistry();
  });

  it('should register and find a template', () => {
    registry.register(testTemplate);
    const registered = registry.find('test-request');
    expect(registered).not.toBe(testTemplate);
    expect(registered?.templateCd).toBe(testTemplate.templateCd);
  });

  it('should return undefined for unknown template', () => {
    expect(registry.find('unknown')).toBeUndefined();
  });

  it('should report has() correctly', () => {
    expect(registry.has('test-request')).toBe(false);
    registry.register(testTemplate);
    expect(registry.has('test-request')).toBe(true);
  });

  it('should return all template codes', () => {
    registry.register(testTemplate);
    expect(registry.getTemplateCodes()).toEqual(['test-request']);
  });

  it('should return all templates', () => {
    registry.register(testTemplate);
    expect(registry.getAll()).toEqual([registry.find('test-request')]);
  });

  it('should unregister a template', () => {
    registry.register(testTemplate);
    expect(registry.unregister('test-request')).toBe(true);
    expect(registry.find('test-request')).toBeUndefined();
  });

  it('should clear all templates', () => {
    registry.register(testTemplate);
    registry.clear();
    expect(registry.getAll()).toEqual([]);
  });

  it('should register multiple templates', () => {
    const t2: MessageTemplate = { ...testTemplate, templateCd: 'test-2' };
    registry.registerAll([testTemplate, t2]);
    expect(registry.getTemplateCodes()).toEqual(['test-request', 'test-2']);
  });

  it('should overwrite on duplicate registration', () => {
    registry.register(testTemplate);
    const updated = { ...testTemplate, description: 'updated' };
    registry.register(updated);
    expect(registry.find('test-request')?.description).toBe('updated');
  });

  it('should reject duplicate action codes deterministically', () => {
    expect(() =>
      registry.register({
        ...testTemplate,
        actions: [
          testTemplate.actions[0],
          {
            ...testTemplate.actions[1],
            actionCd: testTemplate.actions[0].actionCd,
          },
        ],
      }),
    ).toThrow(new TemplateRegistryValidationError('template "test-request" has duplicate actionCd "approved"'));
  });

  it('should reject ambiguous default actions per usertype deterministically', () => {
    expect(() =>
      registry.register({
        ...testTemplate,
        actions: [
          testTemplate.actions[0],
          {
            ...testTemplate.actions[1],
            isDefault: true,
          },
        ],
      }),
    ).toThrow(
      new TemplateRegistryValidationError(
        'template "test-request" has multiple default receiver actions: "approved" and "rejected"',
      ),
    );
  });

  it('should reject actions that are unavailable to both sender and receiver', () => {
    expect(() =>
      registry.register({
        ...testTemplate,
        actions: [
          {
            ...testTemplate.actions[0],
            sender: false,
            receiver: false,
          },
        ],
      }),
    ).toThrow(
      new TemplateRegistryValidationError(
        'template "test-request" action "approved" must be available to sender or receiver',
      ),
    );
  });

  it('should freeze registered action-critical structure without changing function identity', async () => {
    const runHandler = async () => 'ok';
    const condition = () => true;
    const template: MessageTemplate = {
      ...testTemplate,
      senderContent: { ...testTemplate.senderContent },
      actions: [
        {
          ...testTemplate.actions[0],
          condition,
          runHandler,
        },
      ],
    };

    registry.register(template);
    template.actions[0].receiver = false;
    template.actions[0].runHandler = async () => 'changed';
    template.actions.push({
      ...testTemplate.actions[1],
      actionCd: 'late-added',
    });
    template.senderContent.title = 'mutated';

    const registered = registry.find('test-request')!;
    expect(registered.actions.map((action) => action.actionCd)).toEqual(['approved']);
    expect(registered.actions[0].receiver).toBe(true);
    expect(registered.actions[0].condition).toBe(condition);
    expect(registered.actions[0].runHandler).toBe(runHandler);
    await expect(registered.actions[0].runHandler({} as never)).resolves.toBe('ok');
    expect(registered.senderContent.title).toBe('Test Request');
    expect(Object.isFrozen(registered)).toBe(true);
    expect(Object.isFrozen(registered.actions)).toBe(true);
    expect(Object.isFrozen(registered.actions[0])).toBe(true);
  });

  it('should not allow mutation through returned registry references', () => {
    registry.register(testTemplate);
    const registered = registry.find('test-request')!;

    expect(() => {
      registered.actions[0].receiver = false;
    }).toThrow(TypeError);
    expect(registry.find('test-request')?.actions[0].receiver).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// includesAction
// ---------------------------------------------------------------------------

describe('includesAction', () => {
  beforeEach(() => {
    defaultRegistry.clear();
  });

  it('should return false for "paid" action on unknown template', () => {
    expect(includesAction('any-template', 'paid', defaultRegistry)).toBe(false);
  });

  it('should return true for existing action', () => {
    defaultRegistry.register(testTemplate);
    expect(includesAction('test-request', 'approved', defaultRegistry)).toBe(true);
  });

  it('should return false for non-existing action', () => {
    defaultRegistry.register(testTemplate);
    expect(includesAction('test-request', 'nonexistent', defaultRegistry)).toBe(false);
  });

  it('should return false for unknown template', () => {
    expect(includesAction('unknown', 'approved', defaultRegistry)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// interpolateTemplate
// ---------------------------------------------------------------------------

describe('interpolateTemplate', () => {
  it('should interpolate sender content with data', () => {
    const result = interpolateTemplate(testTemplate, { itemName: 'Widget' }, 'sender');
    expect(result).not.toBeNull();
    expect(result!.senderContent.title).toBe('Test Request');
    expect(result!.senderContent.long).toBe('You submitted a request for "Widget".');
    expect(result!.senderContent.short).toBe('Request for Widget');
  });

  it('should interpolate receiver content with data', () => {
    const result = interpolateTemplate(testTemplate, { displayName: 'John', itemName: 'Widget' }, 'receiver');
    expect(result).not.toBeNull();
    expect(result!.receiverContent.long).toBe('"John" submitted a request for "Widget".');
  });

  it('should filter actions for sender', () => {
    const result = interpolateTemplate(testTemplate, {}, 'sender');
    expect(result).not.toBeNull();
    const actionCds = result!.actions.map((a) => a.actionCd);
    expect(actionCds).toEqual(['revoked']);
  });

  it('should filter actions for receiver', () => {
    const result = interpolateTemplate(testTemplate, {}, 'receiver');
    expect(result).not.toBeNull();
    const actionCds = result!.actions.map((a) => a.actionCd);
    expect(actionCds).toEqual(['approved', 'rejected']);
  });

  it('should resolve string uiTemplate', () => {
    const result = interpolateTemplate(testTemplate, {}, 'sender');
    expect(result!.uiTemplate).toBe('default-message');
  });

  it('should resolve object uiTemplate by usertype', () => {
    const template: MessageTemplate = {
      ...testTemplate,
      uiTemplate: { sender: 'sender-view', receiver: 'receiver-view' },
    };
    const senderResult = interpolateTemplate(template, {}, 'sender');
    expect(senderResult!.uiTemplate).toBe('sender-view');

    const receiverResult = interpolateTemplate(template, {}, 'receiver');
    expect(receiverResult!.uiTemplate).toBe('receiver-view');
  });

  it('should apply permission-based action filtering', () => {
    const template: MessageTemplate = {
      ...testTemplate,
      actions: [
        ...testTemplate.actions,
        {
          actionCd: 'admin-only',
          name: 'Admin',
          variant: 'dark',
          sender: false,
          receiver: true,
          permission: 'is.admin',
          runHandler: async () => true,
        },
      ],
    };

    const withoutAdmin = interpolateTemplate(template, {}, 'receiver', {
      permissions: {},
    });
    expect(withoutAdmin!.actions.map((a) => a.actionCd)).not.toContain('admin-only');

    const withAdmin = interpolateTemplate(template, {}, 'receiver', {
      permissions: { 'is.admin': true },
    });
    expect(withAdmin!.actions.map((a) => a.actionCd)).toContain('admin-only');
  });

  it('should apply condition-based action filtering', () => {
    const template: MessageTemplate = {
      ...testTemplate,
      actions: [
        ...testTemplate.actions,
        {
          actionCd: 'conditional',
          name: 'Conditional',
          variant: 'info',
          sender: false,
          receiver: true,

          condition: (msg: any) => msg.isPaid === true,
          runHandler: async () => true,
        },
      ],
    };

    const withoutPayment = interpolateTemplate(template, {}, 'receiver', {
      message: { isPaid: false },
    });
    expect(withoutPayment!.actions.map((a) => a.actionCd)).not.toContain('conditional');

    const withPayment = interpolateTemplate(template, {}, 'receiver', {
      message: { isPaid: true },
    });
    expect(withPayment!.actions.map((a) => a.actionCd)).toContain('conditional');
  });

  it('should render interpolated markup as plain text without HTML sanitization or escaping', () => {
    const template: MessageTemplate = {
      ...testTemplate,
      senderContent: {
        title: '{{markup}}',
        long: 'Body {{{markup}}}',
        short: '{{markup}}',
      },
    };

    const markup = '<img src=x onerror=alert(1)> & "quoted"';
    const result = interpolateTemplate(template, { markup }, 'sender');

    expect(result.senderContent.title).toBe(markup);
    expect(result.senderContent.long).toBe(`Body ${markup}`);
  });

  it('should not resolve prototype-like property paths from hostile data', () => {
    const template: MessageTemplate = {
      ...testTemplate,
      senderContent: {
        title: '{{__proto__.polluted}}|{{constructor.name}}',
        long: '{{toString}}',
        short: '{{prototype.value}}',
      },
    };

    const result = interpolateTemplate(template, {}, 'sender');

    expect(result.senderContent.title).toBe('|');
    expect(result.senderContent.long).toBe('');
    expect(result.senderContent.short).toBe('');
  });

  it('should throw deterministically for malformed templates', () => {
    const template: MessageTemplate = {
      ...testTemplate,
      senderContent: {
        title: 'Broken {{name',
        long: 'unused',
        short: 'unused',
      },
    };

    expect(() => interpolateTemplate(template, { name: 'Widget' }, 'sender')).toThrow(/Parse error|Expecting/);
  });

  it('should render missing nested values as empty strings', () => {
    const template: MessageTemplate = {
      ...testTemplate,
      senderContent: {
        title: '{{missing.value}}',
        long: '{{present.missing.value}}',
        short: 'before {{missing}} after',
      },
    };

    const result = interpolateTemplate(template, { present: {} }, 'sender');

    expect(result.senderContent).toEqual({
      title: '',
      long: '',
      short: 'before  after',
    });
  });

  it('should use Handlebars string coercion for non-string values', () => {
    const template: MessageTemplate = {
      ...testTemplate,
      senderContent: {
        title: '{{count}}|{{enabled}}|{{objectValue}}',
        long: '{{arrayValue}}',
        short: '{{nullValue}}|{{undefinedValue}}',
      },
    };

    const result = interpolateTemplate(
      template,
      {
        arrayValue: ['a', 'b'],
        count: 3,
        enabled: true,
        nullValue: null,
        objectValue: { a: 1 },
        undefinedValue: undefined,
      },
      'sender',
    );

    expect(result.senderContent.title).toBe('3|true|[object Object]');
    expect(result.senderContent.long).toBe('a,b');
    expect(result.senderContent.short).toBe('|');
  });
});

// ---------------------------------------------------------------------------
// filterActions / isActionAllowed (shared filter source)
// ---------------------------------------------------------------------------

describe('filterActions', () => {
  it('should return all matching actions as InterpolatedAction', () => {
    const result = filterActions(testTemplate.actions, 'sender');
    const actionCds = result.map((a) => a.actionCd);
    expect(actionCds).toEqual(['revoked']);
    expect(result[0]).not.toHaveProperty('runHandler');
  });

  it('should compile action names against provided data', () => {
    const template: MessageTemplate = {
      ...testTemplate,
      actions: [
        {
          ...testTemplate.actions[0],
          name: 'Approve {{itemName}}',
        },
      ],
    };
    const result = filterActions(template.actions, 'receiver', { data: { itemName: 'Widget' } });
    expect(result[0].name).toBe('Approve Widget');
  });

  it('should compile confirmation title, message, and notesLabel', () => {
    const template: MessageTemplate = {
      ...testTemplate,
      actions: [
        {
          ...testTemplate.actions[0],
          confirmation: {
            title: 'Reject {{itemName}}',
            message: 'Are you sure about {{itemName}}?',
            notesLabel: 'Reason for rejecting {{itemName}}',
          },
        },
      ],
    };
    const result = filterActions(template.actions, 'receiver', { data: { itemName: 'Widget' } });
    expect(result[0].confirmation).toEqual({
      title: 'Reject Widget',
      message: 'Are you sure about Widget?',
      notesLabel: 'Reason for rejecting Widget',
    });
  });
});

describe('isActionAllowed', () => {
  const message = {
    isSender: (u: { _id: string }) => u._id === 'sender1',
    isReceiver: (u: { _id: string }) => u._id === 'receiver1',
  };

  it('should allow sender when action.sender is true', () => {
    const action = testTemplate.actions.find((a) => a.actionCd === 'revoked')!;
    expect(isActionAllowed(action, { _id: 'sender1' }, message as never)).toBe(true);
  });

  it('should deny sender when action.sender is false', () => {
    const action = testTemplate.actions.find((a) => a.actionCd === 'approved')!;
    expect(isActionAllowed(action, { _id: 'sender1' }, message as never)).toBe(false);
  });

  it('should allow receiver when action.receiver is true', () => {
    const action = testTemplate.actions.find((a) => a.actionCd === 'approved')!;
    expect(isActionAllowed(action, { _id: 'receiver1' }, message as never)).toBe(true);
  });

  it('should deny when permission is missing', () => {
    const template: MessageTemplate = {
      ...testTemplate,
      actions: [
        {
          actionCd: 'admin-only',
          name: 'Admin',
          variant: 'dark',
          sender: false,
          receiver: true,
          permission: 'is.admin',
          runHandler: async () => true,
        },
      ],
    };
    const action = template.actions[0];
    expect(isActionAllowed(action, { _id: 'receiver1' }, message as never)).toBe(false);
    expect(isActionAllowed(action, { _id: 'receiver1' }, message as never, { permissions: { 'is.admin': true } })).toBe(
      true,
    );
  });

  it('should deny when condition returns false', () => {
    const template: MessageTemplate = {
      ...testTemplate,
      actions: [
        {
          actionCd: 'conditional',
          name: 'Conditional',
          variant: 'info',
          sender: false,
          receiver: true,

          condition: (msg: any) => msg.isPaid === true,
          runHandler: async () => true,
        },
      ],
    };
    const action = template.actions[0];

    const msg: any = { ...message, isPaid: false };
    expect(isActionAllowed(action, { _id: 'receiver1' }, msg)).toBe(false);
    msg.isPaid = true;
    expect(isActionAllowed(action, { _id: 'receiver1' }, msg)).toBe(true);
  });
});
