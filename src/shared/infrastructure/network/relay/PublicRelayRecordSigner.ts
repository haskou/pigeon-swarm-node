import { Libp2pPrivateKeyLike } from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';

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
      role: payload.role,
      version: payload.version,
    });
  }

  public async sign(
    payload: PublicRelayRecordPayload,
    privateKey: Libp2pPrivateKeyLike,
  ): Promise<PublicRelayRecord> {
    const signature = await privateKey.sign(
      PublicRelayRecordSigner.encoder.encode(this.canonicalPayload(payload)),
    );

    return new PublicRelayRecord(
      payload,
      Buffer.from(signature).toString('base64url'),
    );
  }

  public async verify(
    payload: PublicRelayRecordPayload,
    signature: string,
    privateKey: Libp2pPrivateKeyLike,
  ): Promise<boolean> {
    return privateKey.publicKey.verify(
      PublicRelayRecordSigner.encoder.encode(this.canonicalPayload(payload)),
      Buffer.from(signature, 'base64url'),
    );
  }
}
