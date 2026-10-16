import {
  libp2pKeyAdapter,
  Libp2pPrivateKeyLike,
} from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import { CallRelayRecordSignature } from '@haskou/pigeon-swarm-crypto';

import { CallRelayRecord } from './CallRelayRecord';
import { CallRelayRecordPrimitives } from './CallRelayRecordPrimitives';
import { CallRelayRecordPayload } from './types/CallRelayRecordPayload';

export default class CallRelayRecordSigner {
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
    const poolSignature = CallRelayRecordSignature.poolSignature(
      completePayload,
      sharedSecret,
    );
    const signature = await privateKey.sign(
      CallRelayRecordSignature.signingBytes(completePayload),
    );

    return new CallRelayRecord(
      { ...completePayload, poolSignature },
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

    try {
      CallRelayRecordSignature.verify(
        payload,
        payload.poolSignature,
        signature,
        sharedSecret,
      );
    } catch {
      return false;
    }

    const publicKey = await libp2pKeyAdapter.publicKeyFromProtobuf(
      Buffer.from(payload.publicKey, 'base64url'),
    );

    return libp2pKeyAdapter.peerIdFromPublicKey(publicKey) === payload.peerId;
  }
}
