import { CommunityNotFoundError } from '../../domain/errors/CommunityNotFoundError';
import { MLSGroupAccess } from '../../domain/MLSGroupAccess';
import { MLSRecord } from '../../domain/MLSRecord';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import MLSRecordRepository from '../../domain/repositories/MLSRecordRepository';
import { MLSRecordPublishMessage } from './messages/MLSRecordPublishMessage';

export default class MLSRecordPublisher {
  constructor(
    private readonly communityRepository: CommunityRepository,
    private readonly recordRepository: MLSRecordRepository,
  ) {}

  public async publish(message: MLSRecordPublishMessage): Promise<MLSRecord> {
    const community = await this.communityRepository.findById(
      message.communityId,
    );

    if (!community) throw new CommunityNotFoundError();

    MLSGroupAccess.assert(
      community,
      message.record.groupId,
      message.authorIdentityId,
      message.record.recipientIdentityId,
    );
    await this.recordRepository.save(message.record, message.proof);

    return message.record;
  }
}
