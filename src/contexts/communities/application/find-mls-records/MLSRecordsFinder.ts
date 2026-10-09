import { CommunityNotFoundError } from '../../domain/errors/CommunityNotFoundError';
import { MLSGroupAccess } from '../../domain/MLSGroupAccess';
import { MLSRecord } from '../../domain/MLSRecord';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import MLSRecordRepository from '../../domain/repositories/MLSRecordRepository';
import { MLSRecordsFindMessage } from './messages/MLSRecordsFindMessage';

export default class MLSRecordsFinder {
  constructor(
    private readonly communityRepository: CommunityRepository,
    private readonly recordRepository: MLSRecordRepository,
  ) {}

  /** Records of one group the actor may read; welcomes only reach their recipient. */
  public async find(message: MLSRecordsFindMessage): Promise<MLSRecord[]> {
    const community = await this.communityRepository.findById(
      message.communityId,
    );

    if (!community) throw new CommunityNotFoundError();

    MLSGroupAccess.assert(community, message.groupId, message.actorIdentityId);

    return (await this.recordRepository.findByCommunity(message.communityId))
      .filter(
        (record) =>
          record.groupId === message.groupId &&
          (!message.kind || record.kind.isEqual(message.kind)) &&
          (message.afterEpoch === undefined ||
            (record.epoch ?? 0) > message.afterEpoch) &&
          (!record.kind.isWelcome() ||
            record.isAddressedTo(message.actorIdentityId)),
      )
      .sort(
        (left, right) =>
          (left.epoch ?? 0) - (right.epoch ?? 0) ||
          left.createdAt.valueOf() - right.createdAt.valueOf() ||
          left.id.valueOf().localeCompare(right.id.valueOf()),
      );
  }
}
