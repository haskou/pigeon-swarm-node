import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { AggregateRoot } from '@haskou/ddd-kernel/domain';
import { PrimitiveOf } from '@haskou/value-objects';

import { ConversationId } from './value-objects/ConversationId';

/**
 * The metadata of a conversation: its roster folded from signed operations.
 * Messages never live here: they travel only through opaque mailboxes.
 */
export class Conversation extends AggregateRoot {
  public static fromPrimitives(
    primitives: PrimitiveOf<Conversation>,
  ): Conversation {
    return new Conversation(
      new ConversationId(primitives.id),
      new NetworkId(primitives.networkId),
      primitives.participantIds.map(
        (participantId) => new IdentityId(participantId),
      ),
      primitives.creatorId ? new IdentityId(primitives.creatorId) : undefined,
    );
  }

  constructor(
    private readonly id: ConversationId,
    private readonly networkId: NetworkId,
    private readonly participants: IdentityId[],
    private readonly creatorId: IdentityId | undefined = undefined,
  ) {
    super();
  }

  public getId(): ConversationId {
    return this.id;
  }

  public getNetworkId(): NetworkId {
    return this.networkId;
  }

  public getParticipantIds(): IdentityId[] {
    return [...this.participants];
  }

  public hasParticipant(identityId: IdentityId): boolean {
    return this.participants.some((participant) =>
      participant.isEqual(identityId),
    );
  }

  public getCreatorId(): IdentityId | undefined {
    return this.creatorId;
  }

  public toPrimitives() {
    return {
      creatorId: this.creatorId?.valueOf(),
      id: this.id.valueOf(),
      networkId: this.networkId.valueOf(),
      participantIds: this.participants.map((participant) =>
        participant.valueOf(),
      ),
    };
  }
}
