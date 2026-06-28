import libp2pKeyAdapter, {
  Libp2pPrivateKeyLike,
} from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import { createHmac, timingSafeEqual } from 'crypto';

import { CallRelayRecord } from './CallRelayRecord';
import { CallRelayRecordPrimitives } from './CallRelayRecordPrimitives';
import { CallRelayRecordPayload } from './types/CallRelayRecordPayload';

export default class CallRelayRecordSigner {
  private static readonly encoder = new TextEncoder();

  private canonicalPayload(payload: CallRelayRecordPayload): string {
    return JSON.stringify({
      expiresAt: payload.expiresAt,
      issuedAt: payload.issuedAt,
      peerId: payload.peerId,
      publicKey: payload.publicKey,
      role: payload.role,
      urls: [...payload.urls].sort(),
      version: payload.version,
    });
  }

  private createPoolSignature(
    payload: CallRelayRecordPayload,
    sharedSecret: string,
  ): string {
    return createHmac('sha256', sharedSecret)
      .update(this.canonicalPayload(payload))
      .digest('base64url');
  }

  private isPoolSignatureValid(
    payload: CallRelayRecordPayload &
      Pick<CallRelayRecordPrimitives, 'poolSignature'>,
    sharedSecret: string,
  ): boolean {
    const expected = Buffer.from(
      this.createPoolSignature(payload, sharedSecret),
      'base64url',
    );
    const received = Buffer.from(payload.poolSignature, 'base64url');

    return (
      expected.length === received.length && timingSafeEqual(expected, received)
    );
  }

  private async buildPayload(
    payload: Omit<CallRelayRecordPayload, 'peerId' | 'publicKey'>,
    privateKey: Libp2pPrivateKeyLike,
  ): Promise<CallRelayRecordPayload> {
    return {
      ...payload,
      peerId: libp2pKeyAdapter.peerIdFromPrivateKey(privateKey),
      publicKey: Buffer.from(
        await libp2pKeyAdapter.publicKeyToProtobuf(privateKey.publicKey),
      ).toString('base64url'),
    };
  }

  public async sign(
    payload: Omit<CallRelayRecordPayload, 'peerId' | 'publicKey'>,
    privateKey: Libp2pPrivateKeyLike,
    sharedSecret: string,
  ): Promise<CallRelayRecord> {
    const completePayload = await this.buildPayload(payload, privateKey);
    const signature = await privateKey.sign(
      CallRelayRecordSigner.encoder.encode(
        this.canonicalPayload(completePayload),
      ),
    );

    return new CallRelayRecord(
      {
        ...completePayload,
        poolSignature: this.createPoolSignature(completePayload, sharedSecret),
      },
      Buffer.from(signature).toString('base64url'),
    );
  }

  public async verify(
    payload: CallRelayRecordPayload &
      Pick<CallRelayRecordPrimitives, 'poolSignature'>,
    signature: string,
    sharedSecret: string,
    now: number = Date.now(),
  ): Promise<boolean> {
    if (payload.expiresAt <= now) {
      return false;
    }

    if (!this.isPoolSignatureValid(payload, sharedSecret)) {
      return false;
    }

    const publicKey = await libp2pKeyAdapter.publicKeyFromProtobuf(
      Buffer.from(payload.publicKey, 'base64url'),
    );

    if (libp2pKeyAdapter.peerIdFromPublicKey(publicKey) !== payload.peerId) {
      return false;
    }

    return publicKey.verify(
      CallRelayRecordSigner.encoder.encode(this.canonicalPayload(payload)),
      Buffer.from(signature, 'base64url'),
    );
  }
}
