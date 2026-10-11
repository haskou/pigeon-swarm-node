import { InvalidSignedRequestError } from '@app/apps/apis/shared/errors/InvalidSignedRequestError';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { IncomingMessage } from 'http';

import {
  REALTIME_PROTOCOL_VERSION,
  REALTIME_TICKET_PROTOCOL_PREFIX,
  realtimeTicketStore,
} from './RealtimeTicketStore';

// base64url of 32 random bytes, as produced by RealtimeTicketStore.
const TICKET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export class WebSocketTicketAuthenticator {
  /**
   * The ticket travels in Sec-WebSocket-Protocol, never in the URL or in
   * query parameters, so it is not written to access logs or browser history.
   */
  public authenticate(request: IncomingMessage): IdentityId {
    const header = request.headers['sec-websocket-protocol'];
    const offered = (Array.isArray(header) ? header.join(',') : header || '')
      .split(',')
      .map((protocol) => protocol.trim())
      .filter((protocol) => protocol.length > 0);
    const tickets = offered
      .filter((protocol) =>
        protocol.startsWith(REALTIME_TICKET_PROTOCOL_PREFIX),
      )
      .map((protocol) =>
        protocol.slice(REALTIME_TICKET_PROTOCOL_PREFIX.length),
      );

    const [ticket] = tickets;

    if (
      !offered.includes(REALTIME_PROTOCOL_VERSION) ||
      tickets.length !== 1 ||
      !ticket ||
      !TICKET_PATTERN.test(ticket)
    ) {
      throw new InvalidSignedRequestError();
    }

    const identityId = realtimeTicketStore.consume(ticket);

    if (!identityId) {
      throw new InvalidSignedRequestError();
    }

    return new IdentityId(identityId);
  }
}
