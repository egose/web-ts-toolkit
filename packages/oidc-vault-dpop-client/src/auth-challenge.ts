const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const TOKEN68 = /^[A-Za-z0-9._~+/-]+=*$/;
const PARAMETER = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+)[ \t]*=[ \t]*(.*)$/;
const CHALLENGE = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+)(?: +(.+))?$/;

/** Split only at unquoted commas; quoted-pairs cannot start/end a challenge. */
const partsOf = (header: string): string[] | undefined => {
  const parts: string[] = [];
  let start = 0;
  const addPart = (end: number) => {
    // HTTP OWS is SP/HTAB only. String.trim() would also accept non-HTTP
    // whitespace such as NBSP outside a quoted-string.
    while (start < end && (header[start] === ' ' || header[start] === '\t')) start++;
    while (end > start && (header[end - 1] === ' ' || header[end - 1] === '\t')) end--;
    parts.push(header.slice(start, end));
  };
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < header.length; index++) {
    const character = header[index];
    if (escaped) escaped = false;
    else if (quoted && character === '\\') escaped = true;
    else if (character === '"') quoted = !quoted;
    else if (!quoted && character === ',') {
      addPart(index);
      start = index + 1;
    }
  }
  if (quoted || escaped) return undefined;
  addPart(header.length);
  return parts;
};

const parameterOf = (part: string): [name: string, value: string] | undefined => {
  const match = PARAMETER.exec(part);
  if (!match) return undefined;
  const name = match[1].toLowerCase();
  const raw = match[2];
  if (TOKEN.test(raw)) return [name, raw];
  if (raw[0] !== '"') return undefined;
  let value = '';
  for (let index = 1; index < raw.length; index++) {
    const character = raw[index];
    if (character === '"') return index === raw.length - 1 ? [name, value] : undefined;
    if (character === '\\') {
      if (++index === raw.length) return undefined;
      value += raw[index];
    } else value += character;
  }
  return undefined;
};

/**
 * A bounded HTTP challenge-list parser, not a substring search. Only one DPoP
 * challenge with a unique set of auth-parameters can authorize recovery. Parse
 * the entire field before returning, including other schemes, so malformed
 * suffixes and quoted text cannot grant an extra refresh/retry. Limit work to
 * 8,192 header characters; permit HTTP quoted-string obs-text, but no controls
 * other than HTAB. Empty list members and duplicate DPoP challenges fail closed.
 */
export const readDpopChallengeError = (header: string | null): 'use_dpop_nonce' | 'invalid_token' | undefined => {
  if (typeof header !== 'string' || header.length > 8192 || !/^[\t\x20-\x7e\x80-\xff]*$/.test(header)) return undefined;
  const parts = partsOf(header);
  if (!parts) return undefined;
  let parameters: Map<string, string> | undefined;
  let dpopParameters: Map<string, string> | undefined;
  let seenDpop = false;
  for (const part of parts) {
    const parameter = parameterOf(part);
    if (parameter) {
      if (!parameters || parameters.has(parameter[0])) return undefined;
      parameters.set(...parameter);
      continue;
    }
    const challenge = CHALLENGE.exec(part);
    if (!challenge) return undefined;
    const isDpop = challenge[1].toLowerCase() === 'dpop';
    if (isDpop && seenDpop) return undefined;
    if (isDpop) seenDpop = true;
    parameters = undefined;
    const credentials = challenge[2];
    if (credentials !== undefined) {
      const first = parameterOf(credentials);
      if (first) parameters = new Map([first]);
      else if (!TOKEN68.test(credentials)) return undefined;
    }
    if (isDpop) dpopParameters = parameters;
  }
  const error = dpopParameters?.get('error');
  return error === 'use_dpop_nonce' || error === 'invalid_token' ? error : undefined;
};
