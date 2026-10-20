import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import OrbitDBCommunityRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityRepository';
import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationPendingError } from '@app/contexts/public-mutations/domain/errors/PublicMutationPendingError';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { ShortLivedLookup } from '@app/contexts/public-mutations/infrastructure/ShortLivedLookup';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { CallRecordIds } from '../../../domain/CallRecordIds';
import { CallRecordClock } from './CallRecordClock';

/**
 * A participant state (joined, left, declined) is signed by the participant
 * itself, one record per call and identity that later sequences supersede. It
 * is admitted only when the admitted start exists and the identity takes part
 * in that conversation or may connect to that community channel. A
 * group-capability call admits any identity of the call's network: its
 * roster is the MLS group the node cannot see, and the capability gates the
 * call routes instead. A missing start or identity is awaited, not refused.
 */
export default class CallParticipantMutationPolicy extends PublicMutationPolicy {
  public static readonly STATES = ['joined', 'left', 'declined'];

  private readonly shape = new PublicMutationRecordShape(
    ['callId', 'id', 'identityId', 'state'],
    ['at'],
    'call_participant',
  );

  private readonly communities = new ShortLivedLookup<Community | undefined>();

  public readonly collection = 'calls';

  public readonly scopeType = 'call_participant';

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    /** Reads the public store directly: the policy runs inside the community storage lock. */
    private readonly communityRepository: OrbitDBCommunityRepository,
    private readonly identityRepository: IdentityRepository,
  ) {
    super();
  }

  private async assertCommunityAccess(
    start: Record<string, unknown>,
    identityId: string,
  ): Promise<void> {
    const scope = start.scope as Record<string, string>;
    const community = await this.communities.get(
      scope.communityId,
      async () => {
        const communityId = new CommunityId(scope.communityId);

        return (await this.communityRepository.hasById(communityId))
          ? this.communityRepository.requireById(communityId)
          : undefined;
      },
    );

    if (!community) throw new PublicMutationPendingError();

    try {
      community.authorizeVoiceChannelCall(
        new IdentityId(identityId),
        new CommunityChannelId(scope.channelId),
      );
    } catch {
      throw new InvalidPublicMutationError();
    }
  }

  private async assertNetworkIdentity(
    start: Record<string, unknown>,
    identityId: string,
  ): Promise<void> {
    const identity = await this.identityRepository.findById(
      new IdentityId(identityId),
    );

    if (!identity) throw new PublicMutationPendingError();

    if (
      !identity
        .getNetworkIds()
        .some((networkId) => networkId.valueOf() === start.networkId)
    ) {
      throw new InvalidPublicMutationError();
    }
  }

  public expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'> {
    this.shape.assert(record);

    if (
      record.removed !== undefined ||
      !CallParticipantMutationPolicy.STATES.includes(record.state as string) ||
      record.id !==
        CallRecordIds.participant(
          record.callId as string,
          record.identityId as string,
        )
    ) {
      throw new InvalidPublicMutationError();
    }

    try {
      new IdentityId(record.identityId as string);
      CallRecordClock.assertNotInFuture(record.at);
    } catch {
      throw new InvalidPublicMutationError();
    }

    return {
      authorIdentityId: record.identityId as string,
      recordId: record.id as string,
      store: this.collection,
    };
  }

  public async assertPermitted(
    record: Record<string, unknown>,
    authorIdentityId: string,
    isDeletion: boolean,
  ): Promise<void> {
    if (isDeletion || record.identityId !== authorIdentityId) {
      throw new InvalidPublicMutationError();
    }

    const [start] = await this.registry.queryDocuments(
      this.collection,
      (document) =>
        document.scopeType === 'call_start' &&
        document.id === CallRecordIds.start(record.callId as string),
    );

    if (!start) throw new PublicMutationPendingError();

    const type = (start.scope as Record<string, unknown>).type;

    if (type === 'conversation') {
      if (!(start.participantIds as string[]).includes(authorIdentityId)) {
        throw new InvalidPublicMutationError();
      }
    } else if (type === 'group_capability') {
      await this.assertNetworkIdentity(start, authorIdentityId);
    } else {
      await this.assertCommunityAccess(start, authorIdentityId);
    }
  }
}
