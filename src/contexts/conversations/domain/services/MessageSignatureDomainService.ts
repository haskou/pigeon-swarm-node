import { Password } from '@app/contexts/shared/domain/value-objects/Password';
import {
  EncryptedKeyPair,
  PrimitiveOf,
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
      targetMessageId: payload.targetMessageId,
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
