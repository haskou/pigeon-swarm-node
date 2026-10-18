import { InvalidPageCursorError } from '../errors/InvalidPageCursorError';

const MAX_CURSOR_LENGTH = 512;
const MAX_POSITION_LENGTH = 256;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

type CursorPayload = { position: string; resource: string };

const CURSOR_FIELDS = ['position', 'resource'];

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= maxLength
  );
}

function hasExactlyCursorFields(value: object): boolean {
  const keys = Object.keys(value).sort();

  return (
    keys.length === CURSOR_FIELDS.length &&
    keys.every((key, index) => key === CURSOR_FIELDS[index])
  );
}

function isCursorPayload(value: unknown): value is CursorPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  if (!hasExactlyCursorFields(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    isNonEmptyString(candidate.position, MAX_POSITION_LENGTH) &&
    isNonEmptyString(candidate.resource, Number.MAX_SAFE_INTEGER)
  );
}

function parseCursor(value: string): CursorPayload {
  if (
    value.length === 0 ||
    value.length > MAX_CURSOR_LENGTH ||
    !BASE64URL_PATTERN.test(value)
  ) {
    throw new InvalidPageCursorError();
  }

  const json = Buffer.from(value, 'base64url').toString('utf8');

  // Reject non-canonical encodings: the value must re-encode to itself.
  if (Buffer.from(json, 'utf8').toString('base64url') !== value) {
    throw new InvalidPageCursorError();
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new InvalidPageCursorError();
  }

  if (!isCursorPayload(parsed)) {
    throw new InvalidPageCursorError();
  }

  return parsed;
}

/**
 * Opaque pagination token, not a capability. It carries only the position and
 * the resource it was issued for, so a cursor from another list is refused
 * with the same error as a garbage one. It grants nothing: callers re-check
 * authorization on every request and never take access from the cursor.
 */
export class PageCursor {
  public static encode(payload: CursorPayload): string {
    return Buffer.from(
      JSON.stringify({
        position: payload.position,
        resource: payload.resource,
      }),
      'utf8',
    ).toString('base64url');
  }

  public static decode(value: string, resource: string): string {
    const payload = parseCursor(value);

    if (payload.resource !== resource) {
      throw new InvalidPageCursorError();
    }

    return payload.position;
  }
}
