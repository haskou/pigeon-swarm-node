import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { AggregateRoot } from '@haskou/ddd-kernel/domain';
import { PrimitiveOf } from '@haskou/value-objects';

import { ConversationAdmins } from './value-objects/ConversationAdmins';
import { ConversationId } from './value-objects/ConversationId';
import { ConversationType } from './value-objects/ConversationType';
import { GroupConversationName } from './value-objects/GroupConversationName';

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
      new ConversationType(primitives.type),
      primitives.participantIds.map(
        (participantId) => new IdentityId(participantId),
      ),
      primitives.name ? new GroupConversationName(primitives.name) : undefined,
      new ConversationAdmins(
        primitives.creatorId ? new IdentityId(primitives.creatorId) : undefined,
        (primitives.adminIds ?? []).map((adminId) => new IdentityId(adminId)),
      ),
    );
  }

  constructor(
    private readonly id: ConversationId,
    private readonly networkId: NetworkId,
    private readonly type: ConversationType,
    private readonly participants: IdentityId[],
    private readonly name: GroupConversationName | undefined = undefined,
    private readonly admins: ConversationAdmins = new ConversationAdmins(),
  ) {
    super();
  }

  private participantIdValues(): string[] {
    return this.participants.map((participant) => participant.valueOf());
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

  public isGroup(): boolean {
    return this.type.isGroup();
  }

  public hasParticipant(identityId: IdentityId): boolean {
    return this.participants.some((participant) =>
      participant.isEqual(identityId),
    );
  }

  public getAdminIds(): IdentityId[] {
    return this.admins.getAdminIds();
  }

  public getCreatorId(): IdentityId | undefined {
    return this.admins.getCreatorId();
  }

  public isAdmin(identityId: IdentityId): boolean {
    return this.admins.isAdmin(identityId);
  }

  public toPrimitives() {
    return {
      ...this.admins.toPrimitives(),
      id: this.id.valueOf(),
      name: this.name?.valueOf(),
      networkId: this.networkId.valueOf(),
      participantIds: this.participantIdValues(),
      type: this.type.toPrimitives(),
    };
  }
}
