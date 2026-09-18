import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { UUID } from '@haskou/value-objects';
import { createHash } from 'node:crypto';

import { CallSessionEpoch } from './CallSessionEpoch';

export class CallId extends UUID {
  public static communitySession(
    networkId: NetworkId,
    communityId: CommunityId,
    channelId: CommunityChannelId,
    epoch: CallSessionEpoch,
  ): CallId {
    const bytes = createHash('sha256')
      .update(
        JSON.stringify([
          'pigeon-community-call-v1',
          networkId.valueOf(),
          communityId.valueOf(),
          channelId.valueOf(),
          epoch.valueOf(),
        ]),
      )
      .digest()
      .subarray(0, 16);
    bytes[6] = (bytes[6] % 16) + 128;
    bytes[8] = (bytes[8] % 64) + 128;
    const hex = bytes.toString('hex');

    return new CallId(
      `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
    );
  }

  public static generate(): CallId {
    return new CallId(UUID.generate().valueOf());
  }
}
