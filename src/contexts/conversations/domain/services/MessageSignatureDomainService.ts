import { Password } from '@app/contexts/shared/domain/value-objects/Password';
import {
  assert,
  EncryptedKeyPair,
  PublicKey,
  Signature,
} from '@haskou/value-objects';

import { Message } from '../entities/messages/Message';
import { MessageSignaturePayload } from '../entities/messages/MessageSignaturePayload';
import { InvalidMessageSignatureError } from '../errors/InvalidMessageSignatureError';

export default class MessageSignatureDomainService {
  public getCanonicalSigningContent(payload: MessageSignaturePayload): string {
    const metadata = payload.getMetadata();

    return JSON.stringify({
      attachmentExternalIdentifiers: payload
        .getAttachments()
        .map((attachment) => attachment.valueOf()),
      authorId: metadata.getAuthorId().valueOf(),
      conversationId: metadata.getConversationId().valueOf(),
      createdAt: metadata.getCreatedAt().valueOf(),
      encryptedPayload: payload.getEncryptedPayload()?.valueOf(),
      id: metadata.getId().valueOf(),
      previousMessageIds: metadata
        .getPreviousMessageIds()
        .map((messageId) => messageId.valueOf()),
      replyToMessageId: metadata.getReplyToMessageId()?.valueOf(),
      targetMessageId: payload.getTargetMessageId()?.valueOf(),
      type: payload.getType().valueOf(),
    });
  }

  public async generateSignature(
    payload: MessageSignaturePayload,
    encryptedKeyPair: EncryptedKeyPair,
    password: Password,
  ): Promise<Signature> {
    return encryptedKeyPair.sign(
      this.getCanonicalSigningContent(payload),
      password,
    );
  }

  public isValidSignature(
    publicKey: PublicKey,
    payload: MessageSignaturePayload,
    signature: Signature,
  ): boolean {
    return publicKey.isValidSignature(
      this.getCanonicalSigningContent(payload),
      signature,
    );
  }

  public assertValidMessageSignature(message: Message): void {
    assert(
      this.isValidSignature(
        message.getAuthorId(),
        message.toSignaturePayload(),
        message.getSignature(),
      ),
      new InvalidMessageSignatureError(),
    );
  }
}
