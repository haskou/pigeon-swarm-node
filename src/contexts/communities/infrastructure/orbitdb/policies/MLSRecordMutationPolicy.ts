import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { ShortLivedLookup } from '@app/contexts/public-mutations/infrastructure/ShortLivedLookup';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Community } from '../../../domain/Community';
import { MLSGroupAccess } from '../../../domain/MLSGroupAccess';
import CommunityRepository from '../../../domain/repositories/CommunityRepository';
import { CommunityId } from '../../../domain/value-objects/CommunityId';
import { MLSRecordId } from '../../../domain/value-objects/MLSRecordId';
import { MLSRecordKind } from '../../../domain/value-objects/MLSRecordKind';
import { MLSRecordDocumentId } from '../MLSRecordDocumentId';

/**
 * MLS records are immutable and opaque: the node checks who may write where,
 * never what the payload says. Receivers run this policy on replicated
 * records too, so a peer cannot write around the API.
 */
export default class MLSRecordMutationPolicy extends PublicMutationPolicy {
  private static readonly BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;

  public static readonly MAX_PAYLOAD_LENGTH = 262_144;

  private readonly shape = new PublicMutationRecordShape(
    ['authorIdentityId', 'communityId', 'groupId', 'id', 'kind', 'payload'],
    ['createdAt'],
    'community_mls',
    { optionalIntegers: ['epoch'], optionalStrings: ['recipientIdentityId'] },
  );

  private readonly communities = new ShortLivedLookup<Community | undefined>();

  public readonly collection = 'mlsRecords';

  public readonly scopeType = 'community_mls';

  constructor(private readonly communityRepository: CommunityRepository) {
    super();
  }

  private assertContent(record: Record<string, unknown>): void {
    const kind = new MLSRecordKind(record.kind as string);
    const payload = record.payload as string;

    if (
      payload.length === 0 ||
      payload.length > MLSRecordMutationPolicy.MAX_PAYLOAD_LENGTH ||
      !MLSRecordMutationPolicy.BASE64.test(payload)
    ) {
      throw new InvalidPublicMutationError();
    }

    this.assertEpoch(kind, record.epoch);
    this.assertRecipient(kind, record.recipientIdentityId);
  }

  private assertEpoch(kind: MLSRecordKind, epoch: unknown): void {
    const needsEpoch = kind.isCommit() || kind.isWelcome();
    const valid = needsEpoch
      ? Number.isSafeInteger(epoch) && (epoch as number) >= 0
      : epoch === undefined;

    if (!valid) throw new InvalidPublicMutationError();
  }

  private assertRecipient(kind: MLSRecordKind, recipient: unknown): void {
    const valid = kind.isWelcome()
      ? typeof recipient === 'string'
      : recipient === undefined;

    if (!valid) throw new InvalidPublicMutationError();
  }

  private async findCommunity(communityId: string): Promise<Community> {
    const community = await this.communities.get(communityId, () =>
      this.communityRepository.findById(new CommunityId(communityId)),
    );

    if (!community) throw new InvalidPublicMutationError();

    return community;
  }

  public expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'> {
    this.shape.assert(record);

    if (record.removed !== undefined) throw new InvalidPublicMutationError();

    try {
      this.assertContent(record);
      const recordId = MLSRecordId.derive({
        epoch: record.epoch as number | undefined,
        groupId: record.groupId as string,
        kind: record.kind as string,
        payload: record.payload as string,
        recipientIdentityId: record.recipientIdentityId as string | undefined,
      }).valueOf();

      if (
        record.id !==
        MLSRecordDocumentId.of(record.communityId as string, recordId)
      ) {
        throw new InvalidPublicMutationError();
      }

      return {
        authorIdentityId: record.authorIdentityId as string,
        recordId: record.id as string,
        store: this.collection,
      };
    } catch {
      throw new InvalidPublicMutationError();
    }
  }

  public async assertPermitted(
    record: Record<string, unknown>,
    authorIdentityId: string,
    isDeletion: boolean,
  ): Promise<void> {
    if (isDeletion) throw new InvalidPublicMutationError();

    const communityId = record.communityId as string;

    MLSGroupAccess.assert(
      await this.findCommunity(communityId),
      record.groupId as string,
      new IdentityId(authorIdentityId),
      typeof record.recipientIdentityId === 'string'
        ? new IdentityId(record.recipientIdentityId)
        : undefined,
    );
  }
}
