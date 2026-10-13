import { Timestamp } from '@haskou/value-objects';

import { MailboxReaderCursor } from './MailboxReaderCursor';
import { MailboxId } from './value-objects/MailboxId';
import { MailboxPostTokenHash } from './value-objects/MailboxPostTokenHash';

export interface MailboxState {
  appendRefilledAt: Timestamp;
  appendTokens: number;
  bytes: number;
  createdAt: Timestamp;
  envelopeCount: number;
  id: MailboxId;
  lastReadAt: Timestamp;
  nextCursor: number;
  postTokenHash: MailboxPostTokenHash;
  readers: MailboxReaderCursor[];
}
