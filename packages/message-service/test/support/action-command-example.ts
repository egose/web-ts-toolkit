import mongoose from 'mongoose';
import { ActionInputValidationError, type MessageTemplate } from '../../src';

export type RejectInput = { notes: string };
export type RejectCommand = RejectInput & {
  attemptId: string;
  messageId: string;
  approvalId: string;
  actorId: string;
};

export class HostCommandConflictError extends Error {}

export function parseRejectInput(raw: unknown): RejectInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ActionInputValidationError();
  const notes = (raw as { notes?: unknown }).notes;
  if (
    Object.keys(raw).some((key) => key !== 'notes') ||
    typeof notes !== 'string' ||
    notes.length > 2000 ||
    !notes.trim()
  ) {
    throw new ActionInputValidationError();
  }
  return { notes: notes.trim() };
}

/** Concrete host store mirrored by the shipped README and executed from its tarball. */
export function createRejectionWorkflow(connection: mongoose.Connection) {
  const Approval = connection.model(
    'ReviewApproval',
    new mongoose.Schema({
      reviewer: { type: String, required: true },
      state: { type: String, default: 'pending' },
      notes: { type: String, default: '' },
      effectCount: { type: Number, default: 0 },
    }),
  );
  const Command = connection.model(
    'ReviewRejectCommand',
    new mongoose.Schema({
      _id: { type: String, required: true }, // MongoDB's unique _id index
      canonical: { type: String, required: true },
      notes: { type: String, required: true },
      result: { type: mongoose.Schema.Types.Mixed, default: null },
    }),
  );

  async function reject(c: RejectCommand) {
    if (!(await Approval.exists({ _id: c.approvalId, reviewer: c.actorId })))
      throw new Error('domain permission denied');
    // Versioned, allowlisted tuple binds message, action/template, target and actor.
    const canonical = JSON.stringify([
      1,
      'approval-review-v1',
      'reject',
      c.messageId,
      c.approvalId,
      c.actorId,
      c.notes,
    ]);
    try {
      await Command.updateOne({ _id: c.attemptId }, { $setOnInsert: { canonical, notes: c.notes } }, { upsert: true });
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 11000)) throw error;
      // A concurrent insert won; compare its durable original in the transaction.
    }
    return connection.transaction(async (session) => {
      // Reauthorize even cached-result reads; package relationship grants alone
      // are insufficient for this domain target. Only local MongoDB writes here.
      const approval = await Approval.findOne({ _id: c.approvalId, reviewer: c.actorId }).session(session).lean();
      if (!approval) throw new Error('domain permission denied');
      const stored = await Command.findById(c.attemptId).session(session).lean();
      if (!stored) throw new Error('command missing');
      if (stored.canonical !== canonical) throw new HostCommandConflictError();
      if (stored.result) return stored.result as { rejected: true; notes: string };
      if (approval.state !== 'pending') throw new Error('approval already decided');
      const changed = await Approval.updateOne(
        { _id: c.approvalId, reviewer: c.actorId, state: 'pending' },
        { $set: { state: 'rejected', notes: stored.notes }, $inc: { effectCount: 1 } },
        { session },
      );
      if (changed.matchedCount !== 1) throw new Error('approval changed');
      const result = { rejected: true as const, notes: stored.notes };
      const completed = await Command.updateOne(
        { _id: c.attemptId, canonical, result: null },
        { $set: { result } },
        { session },
      );
      if (completed.matchedCount !== 1) throw new Error('command changed');
      return result;
    });
  }

  function template(approvalId: string, reviewer: mongoose.Types.ObjectId): MessageTemplate {
    return {
      templateCd: 'approval-review-v1',
      type: 'request',
      description: 'Review a host-authorized target',
      senderContent: { title: 'Sent', long: 'Review requested', short: 'Sent' },
      receiverContent: { title: 'Review', long: 'Please review', short: 'Review' },
      uiTemplate: 'card',
      prepareMessage: async ({ user }) => ({ fromUser: user._id, toUser: reviewer, payload: { approvalId } }),
      actions: [
        {
          actionCd: 'reject',
          name: 'Reject',
          variant: 'danger',
          sender: false,
          receiver: true,
          confirmation: { title: 'Reject', message: 'Reject request?', requireNotes: true },
          parseInput: parseRejectInput,
          async runHandler({ message, user, actionAttemptId, input }) {
            if (!actionAttemptId) throw new Error('attempt missing');
            return reject({
              // Business service is captured by this template closure.
              attemptId: actionAttemptId,
              messageId: String(message._id),
              approvalId: String(message.payload.approvalId), // authoritative claimed target
              actorId: String(user._id),
              notes: (input as RejectInput).notes, // this action's parser output
            });
          },
        },
      ],
    };
  }
  return { Approval, Command, reject, template };
}
