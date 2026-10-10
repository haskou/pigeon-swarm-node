import { IncomingMessage } from 'http';

import { pigeonEnvironment } from '../environment/PigeonEnvironment';

/**
 * Optional browser Origin allowlist for the realtime upgrade.
 *
 * Authentication is a signed query, so the Origin is not a credential: this
 * only lets an operator refuse upgrades started by pages from other sites.
 * Requests without an Origin header (non-browser clients) are not browsers
 * and are always left to signature authentication.
 */
export class WebSocketOriginPolicy {
  private allowedOrigins(): string[] {
    return pigeonEnvironment()
      .REALTIME_ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim().toLowerCase())
      .filter((origin) => origin.length > 0);
  }

  public allows(request: IncomingMessage): boolean {
    const allowed = this.allowedOrigins();
    const origin = request.headers.origin;

    if (allowed.length === 0 || origin === undefined) {
      return true;
    }

    return allowed.includes(origin.toLowerCase());
  }
}
