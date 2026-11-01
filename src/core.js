const TOKEN_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * Thrown when a Link header cannot be parsed. Parsing is strict on purpose:
 * silently dropping malformed entries hides broken upstream servers, and the
 * caller can always catch and skip if they want lenient behaviour.
 */
export class LinkHeaderError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LinkHeaderError';
  }
}

/**
 * Parses a Link header value into an array of `{ target, params }` objects.
 *
 * Multiple Link headers are represented by the caller as a single comma-separated
 * string; per RFC 8288 that is equivalent to sending the header multiple times.
 *
 * @param {string} input
 * @returns {Array<{ target: string, params: Record<string, string> }>}
 */
export function parse(input) {
  if (typeof input !== 'string') {
    throw new LinkHeaderError('Link header must be a string');
  }
  const links = [];
  let i = 0;
  const n = input.length;

  while (i < n) {
    // Skip leading whitespace and empty comma-separated slots.
    while (i < n && (input[i] === ' ' || input[i] === '\t')) i++;
    if (i < n && input[i] === ',') {
      i++;
      continue;
    }
    if (i >= n) break;

    if (input[i] !== '<') {
      throw new LinkHeaderError(`Expected '<' at position ${i}`);
    }
    const close = input.indexOf('>', i + 1);
    if (close === -1) {
      throw new LinkHeaderError(`Unterminated target at position ${i}`);
    }
    const target = input.slice(i + 1, close);
    i = close + 1;

    const params = Object.create(null);
    let sawParams = false;

    while (i < n) {
      while (i < n && (input[i] === ' ' || input[i] === '\t')) i++;
      if (i >= n) break;
      const ch = input[i];
      if (ch === ',') {
        i++;
        break;
      }
      if (ch !== ';') {
        throw new LinkHeaderError(
          `Expected ';' or ',' at position ${i}, got '${ch}'`
        );
      }
      i++;
      while (i < n && (input[i] === ' ' || input[i] === '\t')) i++;
      const { name, next } = readToken(input, i);
      i = next;
      let value = '';
      while (i < n && (input[i] === ' ' || input[i] === '\t')) i++;
      if (i < n && input[i] === '=') {
        i++;
        while (i < n && (input[i] === ' ' || input[i] === '\t')) i++;
        const parsed = readValue(input, i);
        value = parsed.value;
        i = parsed.next;
      }
      // Later occurrences of the same parameter name win, matching the
      // "last value wins" rule used for repeated HTTP header fields.
      params[name] = value;
      sawParams = true;
    }

    links.push({ target, params: sawParams ? params : Object.create(null) });
  }

  return links;
}

function readToken(input, start) {
  let i = start;
  while (i < input.length) {
    const ch = input[i];
    if (ch === ' ' || ch === '\t' || ch === '=' || ch === ';' || ch === ',') break;
    i++;
  }
  if (i === start) {
    throw new LinkHeaderError(`Expected parameter name at position ${start}`);
  }
  const name = input.slice(start, i);
  if (!TOKEN_RE.test(name)) {
    throw new LinkHeaderError(`Invalid parameter name '${name}'`);
  }
  return { name, next: i };
}

function readValue(input, start) {
  if (start >= input.length) {
    throw new LinkHeaderError('Expected parameter value');
  }
  const ch = input[start];
  if (ch === '"') {
    let out = '';
    let i = start + 1;
    while (i < input.length) {
      const c = input[i];
      if (c === '\\') {
        if (i + 1 >= input.length) {
          throw new LinkHeaderError('Trailing backslash in quoted string');
        }
        out += input[i + 1];
        i += 2;
        continue;
      }
      if (c === '"') {
        return { value: out, next: i + 1 };
      }
      out += c;
      i++;
    }
    throw new LinkHeaderError('Unterminated quoted string');
  }
  let i = start;
  while (i < input.length) {
    const c = input[i];
    if (c === ' ' || c === '\t' || c === ';' || c === ',') break;
    i++;
  }
  return { value: input.slice(start, i), next: i };
}

/**
 * Serializes an array of link objects back into a Link header value.
 *
 * The output always uses a single comma-separated header value, which is
 * accepted by every HTTP stack in practice and keeps the result deterministic.
 * Parameter order follows insertion order of the object.
 *
 * @param {Array<{ target: string, params?: Record<string, string> }>} links
 * @returns {string}
 */
export function serialize(links) {
  if (!Array.isArray(links)) {
    throw new LinkHeaderError('serialize expects an array');
  }
  const parts = [];
  for (const link of links) {
    if (!link || typeof link.target !== 'string') {
      throw new LinkHeaderError('Each link must have a string target');
    }
    let part = `<${link.target}>`;
    const params = link.params;
    if (params) {
      for (const name of Object.keys(params)) {
        if (!TOKEN_RE.test(name)) {
          throw new LinkHeaderError(`Invalid parameter name '${name}'`);
        }
        part += `; ${name}=${formatValue(params[name])}`;
      }
    }
    parts.push(part);
  }
  return parts.join(', ');
}

function formatValue(value) {
  if (value === undefined || value === null) {
    return '""';
  }
  const str = String(value);
  if (str !== '' && TOKEN_RE.test(str)) {
    return str;
  }
  // Anything that is not a bare token must be quoted, and embedded quotes and
  // backslashes must be escaped per RFC 7230 quoted-string rules.
  return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
