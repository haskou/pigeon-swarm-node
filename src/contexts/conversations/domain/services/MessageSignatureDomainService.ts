import { Password } from '@app/contexts/shared/domain/value-objects/Password';
import {
  EncryptedKeyPair,
  PrimitiveOf,
  Signature,
} from '@haskou/value-objects';

import { Message } from '../Message';

type MessageSignaturePayload = Omit<PrimitiveOf<Message>, 'signature'>;

export class MessageSignatureDomainService {
  private getCanonicalPayload(
    payload: MessageSignaturePayload,
  ): MessageSignaturePayload {
    return {
      attachmentCids: payload.attachmentCids,
      authorId: payload.authorId,
      conversationId: payload.conversationId,
      createdAt: payload.createdAt,
      encryptedPayload: payload.encryptedPayload,
      id: payload.id,
      previousEventIds: payload.previousEventIds,
      targetEventId: payload.targetEventId,
      type: payload.type,
    };
  }

  public async generateSignature(
    payload: MessageSignaturePayload,
    encryptedKeyPair: EncryptedKeyPair,
    password: Password,
  ): Promise<Signature> {
    return encryptedKeyPair.sign(
      JSON.stringify(this.getCanonicalPayload(payload)),
      password,
    );
  }

  public isValidSignature(
    encryptedKeyPair: EncryptedKeyPair,
    payload: MessageSignaturePayload,
    signature: Signature,
  ): boolean {
    return encryptedKeyPair.isValidSignature(
      JSON.stringify(this.getCanonicalPayload(payload)),
      signature,
    );
  }
}
