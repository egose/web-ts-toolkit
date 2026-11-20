import type { ProviderCall, ProviderResult, RecipientResult } from '../../contracts/provider';
import { SmtpConnection, SmtpFailure, type SmtpResolverFactory, type SmtpStage } from './connection';
import type { SmtpMessage } from './mime';
import type { SmtpConfig } from './options';
import type { SmtpReply } from './reply';

function failed(stage: SmtpStage, reason: SmtpFailure['reason']): ProviderResult {
  if (reason === 'not_transmitted') return { outcome: 'unsubmitted', retry: 'safe_transient', stage, reason };
  if (reason === 'provider_configuration') return { outcome: 'unsubmitted', retry: 'never', stage, reason };
  return { outcome: 'unknown', retry: 'never', stage, reason };
}

function negative(
  stage: SmtpStage,
  code: number,
  permanentRcptRefusal = false,
  recipients: readonly RecipientResult[] = [],
): ProviderResult {
  if (code < 400 || code > 599) throw new SmtpFailure('transport_uncertain');
  const permanent = code >= 500 || permanentRcptRefusal;
  return {
    outcome: 'rejected',
    retry: permanent ? 'never' : 'safe_transient',
    stage,
    reason: permanent ? 'smtp_permanent_reply' : 'smtp_transient_reply',
    ...(recipients.length ? { recipients } : {}),
  };
}

function extensions({ lines }: SmtpReply): { starttls: boolean; mechanisms: Set<string> } {
  let starttls = false;
  const mechanisms = new Set<string>();
  for (const line of lines.slice(1)) {
    const [keyword, ...args] = line
      .trimEnd()
      .toUpperCase()
      .split(/[ \t=]+/);
    if (keyword === 'STARTTLS' && args.length === 0) starttls = true;
    if (keyword === 'AUTH') for (const mechanism of args) mechanisms.add(mechanism);
  }
  return { starttls, mechanisms };
}

async function authenticate(
  connection: SmtpConnection,
  { user, pass }: NonNullable<SmtpConfig['auth']>,
  mechanisms: ReadonlySet<string>,
): Promise<ProviderResult | undefined> {
  connection.stage = 'auth';
  let response: SmtpReply;
  if (mechanisms.has('PLAIN')) {
    const encoded = Buffer.from(`\0${user}\0${pass}`, 'utf8').toString('base64');
    const command = `AUTH PLAIN ${encoded}`;
    if (command.length <= 510) response = await connection.command(command);
    else {
      // RFC 4954: don't exceed the command length with an initial response.
      response = await connection.command('AUTH PLAIN');
      if (response.code !== 334) return negative('auth', response.code);
      response = await connection.command(encoded);
    }
  } else if (mechanisms.has('LOGIN')) {
    response = await connection.command('AUTH LOGIN');
    if (response.code !== 334) return negative('auth', response.code);
    response = await connection.command(Buffer.from(user, 'utf8').toString('base64'));
    if (response.code !== 334) return negative('auth', response.code);
    response = await connection.command(Buffer.from(pass, 'utf8').toString('base64'));
  } else return failed('auth', 'provider_configuration');
  if (response.code !== 235) return negative('auth', response.code);
}

async function exchange(connection: SmtpConnection, config: SmtpConfig, message: SmtpMessage): Promise<ProviderResult> {
  await connection.connect();
  if (config.tls === 'implicit') await connection.startTls();
  connection.stage = 'connect';
  const greeting = await connection.greeting();
  if (greeting.code !== 220) return negative('connect', greeting.code);
  let ehlo = await connection.command('EHLO email.invalid');
  if (ehlo.code !== 250) return negative('connect', ehlo.code);

  if (config.tls === 'starttls') {
    connection.stage = 'tls';
    if (!extensions(ehlo).starttls) return failed('tls', 'provider_configuration');
    const upgrade = await connection.command('STARTTLS');
    if (upgrade.code !== 220) return negative('tls', upgrade.code);
    await connection.startTls();
    // Discard all pre-TLS capabilities (including AUTH), per RFC 3207.
    ehlo = await connection.command('EHLO email.invalid');
    if (ehlo.code !== 250) return negative('tls', ehlo.code);
  }

  if (config.auth) {
    const failure = await authenticate(connection, config.auth, extensions(ehlo).mechanisms);
    if (failure) return failure;
  }
  connection.stage = 'envelope';
  let { code } = await connection.command(`MAIL FROM:<${message.from}>`);
  if (code !== 250) return negative('envelope', code);

  const recipients: RecipientResult[] = [];
  let accepted = 0;
  for (const { address, group, index } of message.destinations) {
    ({ code } = await connection.command(`RCPT TO:<${address}>`));
    if (code === 250 || code === 251) {
      accepted++;
      recipients.push({ group, index, status: 'accepted' });
    } else if (code >= 400 && code <= 599) {
      connection.permanentRcptRefusal ||= code >= 500;
      recipients.push({ group, index, status: 'rejected' });
      // 421 explicitly ends this connection; unanswered RCPTs are not known outcomes.
      if (code === 421) break;
    } else throw new SmtpFailure('transport_uncertain');
  }
  const rejected = recipients.filter(({ status }) => status === 'rejected');
  if (accepted === 0 && recipients.length === message.destinations.length) {
    return negative('envelope', code, connection.permanentRcptRefusal, rejected);
  }
  if (code === 421) {
    return failed('envelope', connection.permanentRcptRefusal ? 'transport_uncertain' : 'not_transmitted');
  }

  connection.stage = 'data';
  ({ code } = await connection.command('DATA'));
  if (code !== 354) return negative('data', code, connection.permanentRcptRefusal, rejected);
  ({ code } = await connection.data(message.openMimeStream));
  if (code !== 250) return negative('data', code, connection.permanentRcptRefusal, rejected);
  // RCPT replies merely allow DATA. Only the complete post-terminator 250 confirms message acceptance.
  return {
    outcome: rejected.length ? 'partially_accepted' : 'accepted',
    retry: 'never',
    stage: 'data',
    reason: rejected.length ? 'smtp_partial' : 'smtp_accepted',
    messageId: message.messageId,
    recipients,
  };
}

export async function submitSmtp(
  config: SmtpConfig,
  message: SmtpMessage,
  call: ProviderCall,
  resolverFactory?: SmtpResolverFactory,
): Promise<ProviderResult> {
  const connection = new SmtpConnection(config, call, resolverFactory);
  try {
    return await exchange(connection, config, message);
  } catch (error) {
    const failure = connection.failure ?? (error instanceof SmtpFailure ? error : undefined);
    return failed(connection.stage, failure?.reason ?? 'transport_uncertain');
  } finally {
    connection.close();
  }
}
