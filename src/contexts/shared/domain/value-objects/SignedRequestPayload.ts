import { createHash } from 'crypto';

/** The fields a signed HTTP request commits to; clients sign its JSON form. */
export type SignedRequestPayload = {
  bodyHash: string;
  method: string;
  path: string;
  timestamp: number;
};

function hashBody(body: unknown): string {
  if (Buffer.isBuffer(body)) {
    return createHash('sha256').update(body).digest('hex');
  }

  return createHash('sha256')
    .update(JSON.stringify(body || {}))
    .digest('hex');
}

/**
 * Single source of the signed-request canonical form. HTTP verification and
 * self-proving payloads (such as read receipts) must both use it, so a proof
 * verifies exactly when the request it was taken from verifies.
 */
export function canonicalSignedRequestPayload(
  method: string,
  path: string,
  timestamp: number,
  body: unknown,
): SignedRequestPayload {
  return {
    bodyHash: hashBody(body),
    method: method.toUpperCase(),
    path,
    timestamp,
  };
}
