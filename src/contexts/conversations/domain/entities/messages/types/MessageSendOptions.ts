import { Timestamp } from '@haskou/value-objects';

import { AttachmentExternalIdentifier } from '../../../value-objects/AttachmentExternalIdentifier';
import { MessageId } from '../../../value-objects/MessageId';

export type MessageSendOptions = {
  attachmentExternalIdentifiers?: AttachmentExternalIdentifier[];
  createdAt?: Timestamp;
  id?: MessageId;
  previousMessageIds?: MessageId[];
  replyToMessageId?: MessageId;
};
