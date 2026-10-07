import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import OrbitDBCommunityRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityRepository';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
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
 * in that conversation or may connect to that community channel.
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
  ) {
    super();
  }

  private async assertCommunityAccess(
    start: Record<string, unknown>,
    identityId: string,
  ): Promise<void> {
    const scope = start.scope as Record<string, string>;
    const community = await this.communities.get(scope.communityId, () =>
      this.communityRepository.findById(new CommunityId(scope.communityId)),
    );

    if (!community) throw new InvalidPublicMutationError();

    community.authorizeVoiceChannelCall(
      new IdentityId(identityId),
      new CommunityChannelId(scope.channelId),
    );
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

    if (!start) throw new InvalidPublicMutationError();

    try {
      if ((start.scope as Record<string, unknown>).type === 'conversation') {
        if (!(start.participantIds as string[]).includes(authorIdentityId)) {
          throw new InvalidPublicMutationError();
        }
      } else {
        await this.assertCommunityAccess(start, authorIdentityId);
      }
    } catch {
      throw new InvalidPublicMutationError();
    }
  }
}
