import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { PrimitiveOf } from '@haskou/value-objects';

import { Conversation } from './Conversation';
import { ConversationAdmins } from './value-objects/ConversationAdmins';
import { ConversationId } from './value-objects/ConversationId';
import { ConversationType } from './value-objects/ConversationType';
import { GroupConversationName } from './value-objects/GroupConversationName';

/**
 * A group is never created or edited directly: its roster is the fold of the
 * signed `ConversationOperation`s of its log, so it can shrink to its creator
 * alone once everybody else left.
 */
export class GroupConversation extends Conversation {
  public static fromPrimitives(
    primitives: PrimitiveOf<Conversation>,
  ): GroupConversation {
    return new GroupConversation(
      new ConversationId(primitives.id),
      new NetworkId(primitives.networkId),
      new GroupConversationName(primitives.name ?? ''),
      primitives.participantIds.map(
        (participantId) => new IdentityId(participantId),
      ),
      primitives.creatorId ? new IdentityId(primitives.creatorId) : undefined,
      (primitives.adminIds ?? []).map((adminId) => new IdentityId(adminId)),
    );
  }

  constructor(
    id: ConversationId,
    networkId: NetworkId,
    name: GroupConversationName,
    participants: IdentityId[],
    creatorId: IdentityId | undefined = undefined,
    adminIds: IdentityId[] = [],
  ) {
    super(
      id,
      networkId,
      ConversationType.GROUP,
      participants,
      name,
      new ConversationAdmins(creatorId, adminIds),
    );
  }
}
