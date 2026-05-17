import { Password } from '@app/contexts/shared/domain/value-objects/Password';
import {
  EncryptedKeyPair,
  PrimitiveOf,
  PublicKey,
  Signature,
} from '@haskou/value-objects';

import { Message } from '../Message';

type MessageSignaturePayload = Omit<PrimitiveOf<Message>, 'signature'> & {
  encryptedPayload?: string;
};

export class MessageSignatureDomainService {
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
}
