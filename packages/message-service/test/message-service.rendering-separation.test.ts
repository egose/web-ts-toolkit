import { describe, expect, it, vi } from 'vitest';
import { MessageService } from '../src/message-service';
import { TemplateRegistry } from '../src/template-registry';
import {
  filterActions,
  interpolateMessageContent,
  interpolateTemplate,
  isActionAllowed,
  resolveUiTemplate,
} from '../src/template-engine';
import type { MessageTemplate } from '../src/types/template';

function buildRegistry(template: MessageTemplate): TemplateRegistry {
  const registry = new TemplateRegistry();
  registry.register(template);
  return registry;
}

function receiverDoc(payload: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    _id: 'msg-1',
    templateCd: 'render-sep',
    payload,
    senderContent: { title: 'S', long: 'Sl', short: 'Ss' },
    receiverContent: { title: 'R', long: 'Rl', short: 'Rs' },
    isSender: () => false,
    isReceiver: (u: { _id: string }) => u._id === 'u2',
    ...extra,
  } as never;
}

describe('MSGF-08 rendering/action separation', () => {
  it('creation succeeds without evaluating a message-field condition and renders content from templateData', async () => {
    const condition = vi.fn((msg: any) => msg.payload.ready === true);
    const template: MessageTemplate = {
      templateCd: 'render-sep',
      type: 'request',
      description: 'render separation',
      senderContent: { title: 'Hello {{name}}', long: 'L {{name}}', short: 'S {{name}}' },
      receiverContent: { title: 'Hi {{name}}', long: 'RL {{name}}', short: 'RS {{name}}' },
      uiTemplate: 'default-message',
      prepareMessage: async ({ user, payload }: any) => ({
        templateData: { name: 'ContentName' },
        fromUser: user._id,
        toUser: 'u2',
        payload: { ...(payload as object), name: 'PayloadName' },
      }),
      actions: [
        {
          actionCd: 'approve',
          name: 'Approve',
          variant: 'primary',
          sender: false,
          receiver: true,
          condition,
          runHandler: async () => true,
        },
      ],
    };
    const stored: any[] = [];
    const messageCreate = vi.fn(async (data: any) => {
      const doc = { ...data, _id: `msg-${stored.length}` };
      stored.push(doc);
      return doc;
    });
    const getModel = vi.fn((name: string) => {
      if (name === 'Message') return { create: messageCreate } as never;
      throw new Error(`unexpected model ${name}`);
    });
    const service = new MessageService({ getModel, registry: buildRegistry(template) });

    const created = await service.createMessage({
      templateCd: 'render-sep',
      user: { _id: 'u1' },
      payload: { toUser: 'u2' },
    });

    expect(created).toHaveLength(1);
    expect(condition).not.toHaveBeenCalled();
    // Content comes from templateData, not payload.
    expect((created[0] as any).senderContent.title).toBe('Hello ContentName');
    expect((created[0] as any).receiverContent.title).toBe('Hi ContentName');
    // Payload is persisted separately for later action-label rendering.
    expect((created[0] as any).payload.name).toBe('PayloadName');
  });

  it('interpolateMessageContent never invokes conditions while the combined helper still filters', () => {
    const condition = vi.fn(() => {
      throw new Error('must not evaluate');
    });
    const template: MessageTemplate = {
      templateCd: 'render-sep',
      type: 'request',
      description: 'x',
      senderContent: { title: 'Hello {{name}}', long: 'L', short: 'S' },
      receiverContent: { title: 'Hi {{name}}', long: 'L', short: 'S' },
      uiTemplate: 'default-message',
      prepareMessage: async () => null,
      actions: [
        {
          actionCd: 'approve',
          name: 'Approve',
          variant: 'primary',
          sender: false,
          receiver: true,
          condition,
          runHandler: async () => true,
        },
      ],
    };
    const content = interpolateMessageContent(template, { name: 'ContentName' });
    expect(content.senderContent.title).toBe('Hello ContentName');
    expect(condition).not.toHaveBeenCalled();

    // Combined helper preserves its contract: content + evaluated actions.
    const throwing = () => interpolateTemplate(template, { name: 'ContentName' }, 'receiver', { message: {} });
    expect(throwing).toThrow();
  });

  it('eligible active listing evaluates conditions; admin/archived views skip them', async () => {
    const condition = vi.fn((msg: any) => msg.payload?.ready === true);
    const template: MessageTemplate = {
      templateCd: 'render-sep',
      type: 'request',
      description: 'x',
      senderContent: { title: 'S', long: 'Sl', short: 'Ss' },
      receiverContent: { title: 'R', long: 'Rl', short: 'Rs' },
      uiTemplate: { sender: 's-view', receiver: 'r-view' },
      prepareMessage: async () => null,
      actions: [
        {
          actionCd: 'approve',
          name: 'Approve {{label}}',
          variant: 'primary',
          sender: false,
          receiver: true,
          condition,
          confirmation: {
            title: 'Confirm {{label}}',
            message: 'Sure {{label}}?',
            notesLabel: 'Note {{label}}',
          },
          runHandler: async () => true,
        },
      ],
    };
    const service = new MessageService({ getModel: (() => ({}) as never) as never, registry: buildRegistry(template) });

    // Eligible: ready=true lists the action with payload-based label.
    condition.mockClear();
    const eligible = await service.getActions('msg-1', 'receiver', {
      user: { _id: 'u2' },
      message: receiverDoc({ ready: true, label: 'PayloadLabel' }),
    });
    expect(condition).toHaveBeenCalled();
    expect(eligible!.uiTemplate).toBe('r-view');
    expect(eligible!.actions.map((a) => a.actionCd)).toEqual(['approve']);
    expect(eligible!.actions[0].name).toBe('Approve PayloadLabel');
    expect(eligible!.actions[0].confirmation).toMatchObject({
      title: 'Confirm PayloadLabel',
      message: 'Sure PayloadLabel?',
      notesLabel: 'Note PayloadLabel',
    });

    // Eligible but condition false: filtered out.
    condition.mockClear();
    const denied = await service.getActions('msg-1', 'receiver', {
      user: { _id: 'u2' },
      message: receiverDoc({ ready: false, label: 'PayloadLabel' }),
    });
    expect(condition).toHaveBeenCalled();
    expect(denied!.actions).toEqual([]);

    // Admin view skips conditions and returns empty actions with the right view.
    condition.mockClear();
    const admin = await service.getActions('msg-1', 'receiver', {
      user: { _id: 'u2' },
      message: receiverDoc({ ready: true, label: 'PayloadLabel' }),
      isAdmin: true,
    });
    expect(condition).not.toHaveBeenCalled();
    expect(admin).toEqual({ uiTemplate: 'r-view', actions: [] });

    // Archived view skips conditions as well.
    condition.mockClear();
    const archived = await service.getActions('msg-1', 'receiver', {
      user: { _id: 'u2' },
      message: receiverDoc({ ready: true, label: 'PayloadLabel' }, { archivedAt: new Date() }),
    });
    expect(condition).not.toHaveBeenCalled();
    expect(archived).toEqual({ uiTemplate: 'r-view', actions: [] });
  });

  it('execution predicate still evaluates persisted message state', () => {
    const action = {
      actionCd: 'approve',
      name: 'Approve',
      variant: 'primary',
      sender: false,
      receiver: true,
      condition: (msg: any) => msg.payload?.ready === true,
      runHandler: async () => true,
    } as never;
    const msg = {
      isSender: () => false,
      isReceiver: (u: { _id: string }) => u._id === 'u2',
      payload: { ready: true },
    } as never;
    expect(isActionAllowed(action as never, { _id: 'u2' }, msg)).toBe(true);
    expect(isActionAllowed(action as never, { _id: 'u2' }, { ...msg, payload: { ready: false } } as never)).toBe(false);
  });

  it('keeps content (templateData) and action labels/confirmations (payload) distinct, incl missing values', async () => {
    const template: MessageTemplate = {
      templateCd: 'render-sep',
      type: 'request',
      description: 'x',
      senderContent: { title: 'Hello {{name}}', long: 'L {{name}}', short: 'S {{name}}' },
      receiverContent: { title: 'Hi {{name}}', long: 'RL {{name}}', short: 'RS {{name}}' },
      uiTemplate: 'default-message',
      prepareMessage: async ({ user }: any) => ({
        templateData: { name: 'ContentName' },
        fromUser: user._id,
        toUser: 'u2',
        payload: { name: 'PayloadName' },
      }),
      actions: [
        {
          actionCd: 'approve',
          name: 'Approve {{name}}',
          variant: 'primary',
          sender: false,
          receiver: true,
          confirmation: { title: 'Confirm {{name}}', message: 'Sure {{name}}?', notesLabel: 'Note {{name}}' },
          runHandler: async () => true,
        },
      ],
    };
    const stored: any[] = [];
    const getModel = ((name: string) => {
      if (name === 'Message')
        return {
          create: async (data: any) => {
            const doc = { ...data, _id: 'msg-0' };
            stored.push(doc);
            return doc;
          },
        } as never;
      throw new Error(name);
    }) as never;
    const service = new MessageService({ getModel, registry: buildRegistry(template) });
    const created = await service.createMessage({ templateCd: 'render-sep', user: { _id: 'u1' }, payload: {} });
    expect((created[0] as any).senderContent.title).toBe('Hello ContentName');

    const listed = await service.getActions('msg-0', 'receiver', {
      user: { _id: 'u2' },
      message: receiverDoc({ name: 'PayloadName' }),
    });
    expect(listed!.actions[0].name).toBe('Approve PayloadName');
    expect(listed!.actions[0].confirmation).toMatchObject({
      title: 'Confirm PayloadName',
      message: 'Sure PayloadName?',
      notesLabel: 'Note PayloadName',
    });

    // Missing values render as empty strings in both sources.
    expect(interpolateMessageContent(template, {}).senderContent.title).toBe('Hello ');
    const missingLabel = filterActions(template.actions, 'receiver', { data: {} });
    expect(missingLabel[0].name).toBe('Approve ');
    expect(missingLabel[0].confirmation?.title).toBe('Confirm ');
    expect(missingLabel[0].confirmation?.message).toBe('Sure ?');
  });

  it('keeps escaping/trusted plain-text semantics and exposes resolveUiTemplate', () => {
    const markup = '<img src=x onerror=alert(1)> & "quoted"';
    const template: MessageTemplate = {
      templateCd: 'render-sep',
      type: 'request',
      description: 'x',
      senderContent: { title: '{{markup}}', long: 'Body {{markup}}', short: '{{markup}}' },
      receiverContent: { title: 'R', long: 'R', short: 'R' },
      uiTemplate: { sender: 's-view', receiver: 'r-view' },
      prepareMessage: async () => null,
      actions: [],
    };
    const content = interpolateMessageContent(template, { markup });
    expect(content.senderContent.title).toBe(markup);
    expect(content.senderContent.long).toBe(`Body ${markup}`);
    expect(resolveUiTemplate(template.uiTemplate, 'receiver')).toBe('r-view');
    expect(resolveUiTemplate('flat-view', 'sender')).toBe('flat-view');
  });
});
