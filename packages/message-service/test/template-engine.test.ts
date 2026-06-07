import { describe, it, expect, beforeEach } from 'vitest';
import { TemplateRegistry, defaultRegistry, includesAction } from '../src/template-registry';
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
    expect(registry.find('test-request')).toBe(testTemplate);
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
    expect(registry.getAll()).toEqual([testTemplate]);
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
