import libp2pKeyAdapter, {
  Libp2pPrivateKeyLike,
} from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';

import { PublicRelayRecord } from './PublicRelayRecord';
import { PublicRelayRecordPayload } from './PublicRelayRecordPayload';

export class PublicRelayRecordSigner {
  private static readonly encoder = new TextEncoder();

  private canonicalPayload(payload: PublicRelayRecordPayload): string {
    return JSON.stringify({
      expiresAt: payload.expiresAt,
      issuedAt: payload.issuedAt,
      multiaddrs: [...payload.multiaddrs].sort(),
      peerId: payload.peerId,
      publicKey: payload.publicKey,
      role: payload.role,
      version: payload.version,
    });
  }

  private async buildPayload(
    payload: Omit<PublicRelayRecordPayload, 'publicKey'>,
    privateKey: Libp2pPrivateKeyLike,
  ): Promise<PublicRelayRecordPayload> {
    return {
      ...payload,
      peerId: libp2pKeyAdapter.peerIdFromPrivateKey(privateKey),
      publicKey: Buffer.from(
        await libp2pKeyAdapter.publicKeyToProtobuf(privateKey.publicKey),
      ).toString('base64url'),
    };
  }

  public async sign(
    payload: Omit<PublicRelayRecordPayload, 'publicKey'>,
    privateKey: Libp2pPrivateKeyLike,
  ): Promise<PublicRelayRecord> {
    const completePayload = await this.buildPayload(payload, privateKey);
    const signature = await privateKey.sign(
      PublicRelayRecordSigner.encoder.encode(
        this.canonicalPayload(completePayload),
      ),
    );

    return new PublicRelayRecord(
      completePayload,
      Buffer.from(signature).toString('base64url'),
    );
  }

  public async verify(
    payload: PublicRelayRecordPayload,
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
      PublicRelayRecordSigner.encoder.encode(this.canonicalPayload(payload)),
      Buffer.from(signature, 'base64url'),
    );
  }
}
