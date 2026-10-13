import MailboxEnvelopeNotifier from '@app/contexts/mailboxes/application/notify/MailboxEnvelopeNotifier';
import { webSocketEventHub } from '@app/shared/infrastructure/websocket/WebSocketEventHub';

export default class WebSocketMailboxEnvelopeNotifier extends MailboxEnvelopeNotifier {
  public envelopeAppended(mailboxId: string, cursor: number): void {
    webSocketEventHub.publishMailboxEnvelope(mailboxId, cursor);
  }

  public readerRevoked(mailboxId: string, readTokenHash: string): void {
    webSocketEventHub.dropMailboxReaderSubscriptions(mailboxId, readTokenHash);
  }

  public mailboxRemoved(mailboxId: string): void {
    webSocketEventHub.dropMailboxSubscriptions(mailboxId);
  }
}
