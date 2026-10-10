import MailboxEnvelopeNotifier from '@app/contexts/mailboxes/application/MailboxEnvelopeNotifier';
import { webSocketEventHub } from '@app/shared/infrastructure/websocket/WebSocketEventHub';

export default class WebSocketMailboxEnvelopeNotifier extends MailboxEnvelopeNotifier {
  public envelopeAppended(mailboxId: string, cursor: number): void {
    webSocketEventHub.publishMailboxEnvelope(mailboxId, cursor);
  }
}
