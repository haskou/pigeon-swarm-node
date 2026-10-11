import { createHash } from 'crypto';

const DIGEST_HEX_LENGTH = 32;
const PART_SEPARATOR = '\u001f';

/**
 * Groups related notifications on the device (the service worker replaces or
 * closes notifications that share a tag). The tag is derived from identifiers
 * with a digest so the payload never carries conversation, community, call or
 * notification identifiers in clear text.
 */
export class PushNotificationGroupTag {
  public static of(kind: string, ...identifiers: string[]): string {
    const digest = createHash('sha256')
      .update([kind, ...identifiers].join(PART_SEPARATOR))
      .digest('hex')
      .slice(0, DIGEST_HEX_LENGTH);

    return `${kind}:${digest}`;
  }
}
