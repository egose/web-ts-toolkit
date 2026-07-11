import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  IconArrowLeft,
  IconBell,
  IconCheck,
  IconCircleCheck,
  IconInbox,
  IconMail,
  IconSend,
  IconX,
} from '@tabler/icons-react';
import type { SessionData, Message, MessageAction, MessageUserRef } from '../types';
import { listMessages, getMessageActions, createMessageFromTemplate, executeMessageAction } from '../api';

interface MessagesPageProps {
  session: SessionData;
}

type Filter = 'inbox' | 'sent' | 'all';
type ComposeFieldType = 'email' | 'text' | 'textarea' | 'date' | 'number' | 'select';
interface ComposeField {
  key: string;
  label: string;
  type: ComposeFieldType;
  required: boolean;
}

const templateLabels: Record<string, string> = {
  'team-invitation': 'Team Invitation',
  'task-assignment': 'Task Assignment',
  'approval-request': 'Approval Request',
  'direct-message': 'Direct Message',
  'system-announcement': 'System Announcement',
};

const variantClasses: Record<string, string> = {
  primary: 'bg-blue-600 hover:bg-blue-700 text-white',
  success: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  danger: 'bg-red-600 hover:bg-red-700 text-white',
  secondary: 'bg-slate-600 hover:bg-slate-700 text-white',
};

const variantIcons: Record<string, typeof IconCheck> = {
  success: IconCircleCheck,
  danger: IconX,
  secondary: IconCheck,
  primary: IconCheck,
};

const composeFields: Record<string, ComposeField[]> = {
  'team-invitation': [
    { key: 'inviteeEmail', label: 'Email', type: 'email', required: true },
    { key: 'organizationName', label: 'Organization Name', type: 'text', required: true },
  ],
  'task-assignment': [
    { key: 'toUserEmail', label: 'Assign to (email)', type: 'email', required: true },
    { key: 'taskTitle', label: 'Task Title', type: 'text', required: true },
    { key: 'taskDescription', label: 'Description', type: 'textarea', required: false },
    { key: 'dueDate', label: 'Due Date', type: 'date', required: false },
  ],
  'approval-request': [
    { key: 'toUserEmail', label: 'Approver Email', type: 'email', required: true },
    { key: 'requestTitle', label: 'Request Title', type: 'text', required: true },
    { key: 'requestDetails', label: 'Details', type: 'textarea', required: true },
    { key: 'amount', label: 'Amount ($)', type: 'number', required: false },
  ],
  'direct-message': [
    { key: 'toUserEmail', label: 'To (email)', type: 'email', required: true },
    { key: 'subject', label: 'Subject', type: 'text', required: true },
    { key: 'body', label: 'Message', type: 'textarea', required: true },
  ],
  'system-announcement': [
    { key: 'title', label: 'Title', type: 'text', required: true },
    { key: 'body', label: 'Body', type: 'textarea', required: true },
    { key: 'priority', label: 'Priority', type: 'select', required: false },
  ],
};

const PRIORITIES = ['low', 'normal', 'high'];

const EMAIL_KEYS = new Set(['inviteeEmail', 'toUserEmail']);

function normalizePayload(payload: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    const trimmedValue = value.trim();
    if (!trimmedValue) continue;

    out[key] = EMAIL_KEYS.has(key) ? trimmedValue.toLowerCase() : trimmedValue;
  }
  return out;
}

function isRequiredFilled(templateCd: string, form: Record<string, string>): boolean {
  return (composeFields[templateCd] ?? []).filter((f) => f.required).every((f) => form[f.key]?.trim());
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getUserId(value: MessageUserRef | string | null): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  return value._id;
}

function getUserName(value: MessageUserRef | string | null, fallback = 'Someone'): string {
  if (value == null) return fallback;
  if (typeof value === 'string') return fallback;
  return value.displayName || value.email || fallback;
}

export function MessagesPage({ session }: MessagesPageProps) {
  const queryClient = useQueryClient();
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [composeTemplate, setComposeTemplate] = useState<keyof typeof templateLabels>('direct-message');
  const [composeForm, setComposeForm] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('inbox');
  const [pendingAction, setPendingAction] = useState<{ action: MessageAction; notes: string } | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const handle = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(handle);
  }, [toast]);

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message });
  }

  const messagesQuery = useQuery({
    queryKey: ['messages'],
    queryFn: () => listMessages(),
  });

  const actionsQuery = useQuery({
    queryKey: ['message-actions', selectedMessage?._id, session.user.id],
    queryFn: () => {
      if (!selectedMessage) return null;
      const isSender = getUserId(selectedMessage.fromUser) === session.user.id;
      const usertype: 'sender' | 'receiver' = isSender ? 'sender' : 'receiver';
      return getMessageActions(selectedMessage._id, usertype);
    },
    enabled: !!selectedMessage,
  });

  const executeActionMutation = useMutation({
    mutationFn: ({ messageId, actionCd, notes }: { messageId: string; actionCd: string; notes?: string }) =>
      executeMessageAction(messageId, actionCd, notes ? { notes } : {}),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      setSelectedMessage(null);
      setPendingAction(null);
      const message =
        data && typeof data === 'object' && 'message' in data
          ? String((data as Record<string, unknown>).message)
          : 'Action completed';
      showToast('success', message);
    },
    onError: (error) => {
      showToast('error', error instanceof Error ? error.message : 'Action failed');
    },
  });

  const createMessageMutation = useMutation({
    mutationFn: ({ templateCd, payload }: { templateCd: string; payload: Record<string, unknown> }) =>
      createMessageFromTemplate(templateCd, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      setShowCompose(false);
      setComposeForm({});
      showToast('success', 'Message sent');
    },
    onError: (error) => {
      showToast('error', error instanceof Error ? error.message : 'Failed to send');
    },
  });

  const allMessages = messagesQuery.data ?? [];
  const messages = allMessages.filter((message) => {
    if (filter === 'all') return true;
    const isSender = getUserId(message.fromUser) === session.user.id;
    return filter === 'sent' ? isSender : !isSender;
  });
  const inboxUnread = allMessages.filter((message) => {
    const isSender = getUserId(message.fromUser) === session.user.id;
    return !isSender;
  }).length;

  function handleSelectMessage(message: Message) {
    setSelectedMessage(message);
    setShowCompose(false);
  }

  function handleBack() {
    setSelectedMessage(null);
    setPendingAction(null);
  }

  function handleOpenCompose() {
    setShowCompose(true);
    setSelectedMessage(null);
    setComposeForm({});
  }

  function handleComposeSubmit() {
    const payload = normalizePayload(composeForm);
    createMessageMutation.mutate({ templateCd: composeTemplate, payload });
  }

  function handleActionClick(action: MessageAction) {
    if (action.confirmation) {
      setPendingAction({ action, notes: '' });
      return;
    }
    executeActionMutation.mutate({ messageId: selectedMessage!._id, actionCd: action.actionCd });
  }

  function handleConfirmAction() {
    if (!pendingAction || !selectedMessage) return;
    if (pendingAction.action.confirmation?.requireNotes && !pendingAction.notes.trim()) {
      showToast('error', 'Notes are required for this action');
      return;
    }
    executeActionMutation.mutate({
      messageId: selectedMessage._id,
      actionCd: pendingAction.action.actionCd,
      notes: pendingAction.notes,
    });
  }

  const availableActions = actionsQuery.data?.actions ?? [];
  const isSender = selectedMessage ? getUserId(selectedMessage.fromUser) === session.user.id : false;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Messages</h1>
          <p className="text-sm text-slate-400">
            {messages.length} of {allMessages.length} message{allMessages.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={handleOpenCompose}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <IconSend size={16} />
          Compose
        </button>
      </div>

      {toast && (
        <div
          className={`mb-4 rounded-lg border px-4 py-2 text-sm ${
            toast.type === 'success'
              ? 'border-emerald-700 bg-emerald-900/40 text-emerald-200'
              : 'border-red-700 bg-red-900/40 text-red-200'
          }`}
        >
          {toast.message}
        </div>
      )}

      {showCompose && (
        <div className="mb-6 rounded-lg border border-white/10 bg-[#1a1b1e] p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">New Message</h2>
          <div className="mb-4">
            <label className="mb-1 block text-sm text-slate-400">Type</label>
            <select
              value={composeTemplate}
              onChange={(e) => {
                setComposeTemplate(e.target.value as keyof typeof templateLabels);
                setComposeForm({});
              }}
              className="w-full rounded-lg border border-white/10 bg-[#25262b] px-3 py-2 text-sm text-white"
            >
              {Object.entries(templateLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {composeFields[composeTemplate]?.map((field) => (
            <div key={field.key} className="mb-4">
              <label className="mb-1 block text-sm text-slate-400">
                {field.label} {field.required && <span className="text-red-400">*</span>}
              </label>
              {field.type === 'textarea' ? (
                <textarea
                  value={composeForm[field.key] || ''}
                  onChange={(e) => setComposeForm({ ...composeForm, [field.key]: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-[#25262b] px-3 py-2 text-sm text-white"
                  rows={3}
                />
              ) : field.type === 'select' ? (
                <select
                  value={composeForm[field.key] || ''}
                  onChange={(e) => setComposeForm({ ...composeForm, [field.key]: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-[#25262b] px-3 py-2 text-sm text-white"
                >
                  <option value="">—</option>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type}
                  value={composeForm[field.key] || ''}
                  onChange={(e) => setComposeForm({ ...composeForm, [field.key]: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-[#25262b] px-3 py-2 text-sm text-white"
                />
              )}
            </div>
          ))}

          <div className="flex gap-2">
            <button
              onClick={handleComposeSubmit}
              disabled={createMessageMutation.isPending || !isRequiredFilled(composeTemplate, composeForm)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <IconSend size={16} />
              {createMessageMutation.isPending ? 'Sending...' : 'Send'}
            </button>
            <button
              onClick={() => setShowCompose(false)}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {pendingAction && (
        <div className="mb-6 rounded-lg border border-amber-700 bg-amber-900/20 p-6">
          <h3 className="mb-2 text-lg font-semibold text-white">{pendingAction.action.confirmation?.title}</h3>
          <p className="mb-4 text-sm text-slate-300">{pendingAction.action.confirmation?.message}</p>
          {pendingAction.action.confirmation?.requireNotes && (
            <div className="mb-4">
              <label className="mb-1 block text-sm text-slate-400">
                {pendingAction.action.confirmation.notesLabel || 'Notes'} <span className="text-red-400">*</span>
              </label>
              <textarea
                value={pendingAction.notes}
                onChange={(e) => setPendingAction({ ...pendingAction, notes: e.target.value })}
                className="w-full rounded-lg border border-white/10 bg-[#25262b] px-3 py-2 text-sm text-white"
                rows={2}
              />
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleConfirmAction}
              disabled={executeActionMutation.isPending}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
                variantClasses[pendingAction.action.variant] || variantClasses.primary
              } disabled:opacity-50`}
            >
              {pendingAction.action.name}
            </button>
            <button
              onClick={() => setPendingAction(null)}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {selectedMessage && (
        <div className="mb-6 rounded-lg border border-white/10 bg-[#1a1b1e] p-6">
          <button onClick={handleBack} className="mb-4 flex items-center gap-1 text-sm text-slate-400 hover:text-white">
            <IconArrowLeft size={14} />
            Back to messages
          </button>

          <div className="mb-4">
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
                {templateLabels[selectedMessage.templateCd] || selectedMessage.templateCd}
              </span>
              <span className="text-xs text-slate-500">{formatDate(selectedMessage.createdAt)}</span>
            </div>
            <h2 className="text-xl font-semibold text-white">
              {selectedMessage.receiverContent?.title ||
                templateLabels[selectedMessage.templateCd] ||
                selectedMessage.templateCd}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {isSender ? 'To' : 'From'}:{' '}
              {isSender
                ? getUserName(selectedMessage.toUser, 'Recipient')
                : getUserName(selectedMessage.fromUser, 'Sender')}
            </p>
          </div>

          <div className="mb-6 rounded-lg bg-[#25262b] p-4">
            <p className="whitespace-pre-wrap text-sm text-slate-300">
              {selectedMessage.receiverContent?.long || selectedMessage.receiverContent?.short || 'No content'}
            </p>
          </div>

          {actionsQuery.isLoading && <div className="text-sm text-slate-500">Loading actions...</div>}

          {availableActions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {availableActions.map((action) => {
                const Icon = variantIcons[action.variant] || IconCheck;
                return (
                  <button
                    key={action.actionCd}
                    onClick={() => handleActionClick(action)}
                    disabled={executeActionMutation.isPending}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
                      variantClasses[action.variant] || variantClasses.secondary
                    } disabled:opacity-50`}
                  >
                    <Icon size={14} />
                    {action.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!selectedMessage && !showCompose && (
        <>
          <div className="mb-4 flex gap-2">
            {(['inbox', 'sent', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
                  filter === f ? 'bg-blue-600 text-white' : 'bg-[#25262b] text-slate-300 hover:bg-[#2d2e33]'
                }`}
              >
                {f === 'inbox' && <IconInbox size={12} />}
                {f === 'inbox' && inboxUnread > 0 && (
                  <span className="rounded-full bg-blue-500 px-1.5 text-[10px] text-white">{inboxUnread}</span>
                )}
                {f === 'sent' && <IconSend size={12} />}
                {f === 'all' && <IconBell size={12} />}
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {messagesQuery.isLoading && <div className="py-12 text-center text-slate-500">Loading messages...</div>}

            {!messagesQuery.isLoading && messages.length === 0 && (
              <div className="rounded-lg border border-white/10 bg-[#1a1b1e] py-12 text-center">
                <IconMail size={48} className="mx-auto mb-3 text-slate-600" />
                <p className="text-slate-400">
                  {filter === 'inbox'
                    ? 'No received messages'
                    : filter === 'sent'
                      ? 'No sent messages'
                      : 'No messages yet'}
                </p>
                <p className="mt-1 text-sm text-slate-600">Send a message to get started</p>
              </div>
            )}

            {messages.map((message) => {
              const isMsgSender = getUserId(message.fromUser) === session.user.id;
              const otherName = isMsgSender
                ? getUserName(message.toUser, 'Recipient')
                : getUserName(message.fromUser, 'Sender');
              const isSenderContent = isMsgSender;
              const content = isSenderContent ? message.senderContent : message.receiverContent;
              return (
                <button
                  key={message._id}
                  onClick={() => handleSelectMessage(message)}
                  className="w-full rounded-lg border border-white/10 bg-[#1a1b1e] p-4 text-left transition-colors hover:border-white/20 hover:bg-[#25262b]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
                          {templateLabels[message.templateCd] || message.templateCd}
                        </span>
                        {isMsgSender ? (
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <IconSend size={10} /> To: {otherName}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-blue-400">
                            <IconBell size={10} /> From: {otherName}
                          </span>
                        )}
                      </div>
                      <h3 className="truncate text-sm font-medium text-white">
                        {content?.title || templateLabels[message.templateCd] || message.templateCd}
                      </h3>
                      <p className="mt-0.5 truncate text-xs text-slate-400">
                        {content?.short || content?.long?.slice(0, 80) || ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-600">{formatDate(message.createdAt)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
