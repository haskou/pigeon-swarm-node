import { InvalidPageCursorError } from '../errors/InvalidPageCursorError';

function isPayload(
  value: unknown,
): value is { caller: string; position: string; resource: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.caller === 'string' &&
    typeof candidate.position === 'string' &&
    typeof candidate.resource === 'string'
  );
}

function parseCursor(
  value: string,
): { caller: string; position: string; resource: string } | undefined {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );

    return isPayload(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Opaque page cursor. The payload names the resource and the caller that
 * issued it, so a cursor cannot be replayed against another list or another
 * identity. Clients must treat the value as an opaque string.
 */
export class PageCursor {
  public static encode(payload: {
    caller: string;
    position: string;
    resource: string;
  }): string {
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  }

  public static decode(
    value: string,
    expected: { caller: string; resource: string },
  ): string {
    const payload = parseCursor(value);

    if (
      payload === undefined ||
      payload.caller !== expected.caller ||
      payload.resource !== expected.resource
    ) {
      throw new InvalidPageCursorError();
    }

    return payload.position;
  }
}
