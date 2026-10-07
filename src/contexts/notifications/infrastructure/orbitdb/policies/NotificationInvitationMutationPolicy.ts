import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import OrbitDBCommunityRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityRepository';
import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import PublicMutationVerifier, {
  PublicMutationExpectation,
} from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { ShortLivedLookup } from '@app/contexts/public-mutations/infrastructure/ShortLivedLookup';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { NotificationReplicationLimits } from '../../../domain/NotificationReplicationLimits';
import { EncryptedCommunityKey } from '../../../domain/value-objects/EncryptedCommunityKey';
import { EncryptedConversationKey } from '../../../domain/value-objects/EncryptedConversationKey';
import { InvitationNonce } from '../../../domain/value-objects/InvitationNonce';
import { NotificationId } from '../../../domain/value-objects/NotificationId';
import { NotificationType } from '../../../domain/value-objects/NotificationType';
import { GenuineRecordQuota } from './GenuineRecordQuota';

/**
 * An invitation is admitted only when its inviter signed it, its id is derived
 * from the inviter, recipient, subject and nonce, the signed community or
 * conversation state lets the inviter invite that recipient, and the inviter is
 * still within the invitation quota.
 *
 * Invitations carry no signed time, and a node only sees them when they reach
 * it, so a per-minute window would admit different records on different
 * nodes. The replication gate bounds the total instead: the genuine
 * invitations of one inviter are ordered by id and only the first
 * `limits.maxInvitations` are admitted. The verdict depends only on the set of
 * stored records, so every node reaches the same one whatever order they
 * arrived in. The per-minute rate cap stays a local write-path control.
 */
export default class NotificationInvitationMutationPolicy extends PublicMutationPolicy {
  private static readonly TYPES = [
    NotificationType.COMMUNITY_INVITATION.valueOf(),
    NotificationType.CONVERSATION_INVITATION.valueOf(),
    NotificationType.GROUP_CONVERSATION_INVITATION.valueOf(),
  ];

  private readonly shape = new PublicMutationRecordShape(
    [
      'encryptedKey',
      'id',
      'inviterIdentityId',
      'nonce',
      'recipientIdentityId',
      'subjectId',
      'type',
    ],
    [],
    'notification_invitation',
  );

  private readonly communities = new ShortLivedLookup<Community | undefined>();

  private readonly quota: GenuineRecordQuota;

  private readonly conversations = new ShortLivedLookup<
    Conversation | undefined
  >();

  public readonly collection = 'notifications';

  public limits = NotificationReplicationLimits.fromEnvironment();

  public readonly scopeType = 'notification_invitation';

  constructor(
    private readonly conversationRepository: ConversationRepository,
    /** Reads the public store directly: the policy runs inside the community storage lock. */
    private readonly communityRepository: OrbitDBCommunityRepository,
    registry: OrbitDBReplicatedStateRegistry,
    verifier: PublicMutationVerifier,
  ) {
    super();
    this.quota = new GenuineRecordQuota(this.collection, registry, verifier);
  }

  private async assertCommunityInviter(
    record: Record<string, unknown>,
    authorIdentityId: string,
  ): Promise<void> {
    const community = await this.communities.get(
      record.subjectId as string,
      () =>
        this.communityRepository.findById(
          new CommunityId(record.subjectId as string),
        ),
    );

    if (!community) throw new InvalidPublicMutationError();
    community.assertCanCreateInvite(new IdentityId(authorIdentityId));
  }

  private async assertConversationParticipants(
    record: Record<string, unknown>,
    authorIdentityId: string,
  ): Promise<void> {
    const conversation = await this.conversations.get(
      record.subjectId as string,
      () =>
        this.conversationRepository.findMetadataById(
          new ConversationId(record.subjectId as string),
        ),
    );

    if (
      !conversation?.hasParticipant(new IdentityId(authorIdentityId)) ||
      !conversation.hasParticipant(
        new IdentityId(record.recipientIdentityId as string),
      )
    ) {
      throw new InvalidPublicMutationError();
    }
  }

  private isCommunity(record: Record<string, unknown>): boolean {
    return record.type === NotificationType.COMMUNITY_INVITATION.valueOf();
  }

  private assertKey(record: Record<string, unknown>): void {
    const key = record.encryptedKey as string;

    if (this.isCommunity(record)) new EncryptedCommunityKey(key);
    else new EncryptedConversationKey(key);
  }

  public expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'> {
    this.shape.assert(record);

    if (
      record.removed !== undefined ||
      !NotificationInvitationMutationPolicy.TYPES.includes(
        record.type as string,
      )
    ) {
      throw new InvalidPublicMutationError();
    }

    try {
      new IdentityId(record.recipientIdentityId as string);
      new InvitationNonce(record.nonce as string);
      this.assertKey(record);

      const id = NotificationId.invitation(
        new IdentityId(record.inviterIdentityId as string).valueOf(),
        record.recipientIdentityId as string,
        record.subjectId as string,
        record.nonce as string,
      ).valueOf();

      if (record.id !== id) throw new InvalidPublicMutationError();

      return {
        authorIdentityId: record.inviterIdentityId as string,
        recordId: id,
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

    try {
      if (this.isCommunity(record)) {
        await this.assertCommunityInviter(record, authorIdentityId);
      } else {
        await this.assertConversationParticipants(record, authorIdentityId);
      }

      await this.quota.assertWithin(record, {
        authorField: 'inviterIdentityId',
        expectationOf: (payload) => this.expectationOf(payload),
        limit: this.limits.maxInvitations,
        scopeType: this.scopeType,
      });
    } catch {
      throw new InvalidPublicMutationError();
    }
  }
}
