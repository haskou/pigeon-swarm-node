import { Password } from '@app/contexts/shared/domain/value-objects/Password';
import {
  assert,
  EncryptedKeyPair,
  PublicKey,
  Signature,
} from '@haskou/value-objects';

import { InvalidMessageSignatureError } from '../errors/InvalidMessageSignatureError';
import { Message } from '../Message';
import { MessageSignaturePayload } from '../types/MessageSignaturePayload';

export default class MessageSignatureDomainService {
  private getCanonicalPayload(
    payload: MessageSignaturePayload,
  ): MessageSignaturePayload {
    return {
      attachmentExternalIdentifiers: payload.attachmentExternalIdentifiers,
      authorId: payload.authorId,
      conversationId: payload.conversationId,
      createdAt: payload.createdAt,
      encryptedPayload: payload.encryptedPayload,
      id: payload.id,
      previousMessageIds: payload.previousMessageIds,
      replyToMessageId: payload.replyToMessageId,
      targetMessageId: payload.targetMessageId,
      type: payload.type,
    };
  }

  public serializePayload(payload: MessageSignaturePayload): string {
    return JSON.stringify(this.getCanonicalPayload(payload));
  }

  public async generateSignature(
    payload: MessageSignaturePayload,
    encryptedKeyPair: EncryptedKeyPair,
    password: Password,
  ): Promise<Signature> {
    return encryptedKeyPair.sign(this.serializePayload(payload), password);
  }

  public isValidSignature(
    publicKey: PublicKey,
    payload: MessageSignaturePayload,
    signature: Signature,
  ): boolean {
    return publicKey.isValidSignature(
      this.serializePayload(payload),
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
