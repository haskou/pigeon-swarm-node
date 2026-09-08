import { createHmac } from 'crypto';

import { FederatedTurnCredential } from './types/FederatedTurnCredential';

export default class CallRelayCredentialIssuer {
  private windowStart = 0;
  private total = 0;
  private readonly requests = new Map<string, number>();

  private consumeQuota(peer: string, now: number): void {
    if (now - this.windowStart >= 60_000) {
      this.windowStart = now;
      this.total = 0;
      this.requests.clear();
    }
    const count = this.requests.get(peer) ?? 0;

    if (count >= 10 || this.total >= 100)
      throw new Error('TURN credential request rejected');
    this.requests.set(peer, count + 1);
    this.total++;
  }

  public issue(
    peer: string,
    urls: string[],
    secret: string,
    now: number = Date.now(),
  ): FederatedTurnCredential {
    if (!secret || urls.length === 0 || urls.length > 8)
      throw new Error('TURN credential request rejected');
    this.consumeQuota(peer, now);
    const subject = createHmac('sha256', secret)
      .update('pigeon.turn.subject.v2\0')
      .update(peer)
      .digest('hex')
      .slice(0, 32);
    const username = `${Math.floor(now / 1000) + 600}:${subject}`;

    return {
      credential: createHmac('sha1', secret).update(username).digest('base64'),
      urls,
      username,
    };
  }
}
