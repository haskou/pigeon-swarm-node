import libp2pKeyAdapter, {
  Libp2pPrivateKeyLike,
} from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';

import { CallRelayRecord } from './CallRelayRecord';
import { CallRelayRecordPrimitives } from './CallRelayRecordPrimitives';

type CallRelayRecordPayload = Omit<CallRelayRecordPrimitives, 'signature'>;

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
  ): Promise<CallRelayRecord> {
    const completePayload = await this.buildPayload(payload, privateKey);
    const signature = await privateKey.sign(
      CallRelayRecordSigner.encoder.encode(
        this.canonicalPayload(completePayload),
      ),
    );

    return new CallRelayRecord(
      completePayload,
      Buffer.from(signature).toString('base64url'),
    );
  }

  public async verify(
    payload: CallRelayRecordPayload,
    signature: string,
    now: number = Date.now(),
  ): Promise<boolean> {
    if (payload.expiresAt <= now) {
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
