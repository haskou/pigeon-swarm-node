import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class PollAudience {
  public static communityMembers(memberIds: IdentityId[]): PollAudience {
    return new PollAudience(memberIds, []);
  }

  public static conversationParticipants(
    participantIds: IdentityId[],
  ): PollAudience {
    return new PollAudience([], participantIds);
  }

  public static communityChannel(): PollAudience {
    return new PollAudience([], []);
  }

  public static empty(): PollAudience {
    return new PollAudience([], []);
  }

  private constructor(
    private readonly memberIds: IdentityId[],
    private readonly participantIds: IdentityId[],
  ) {}

  public toPrimitives(): {
    memberIds?: string[];
    participantIds?: string[];
  } {
    return {
      memberIds:
        this.memberIds.length > 0
          ? this.memberIds.map((memberId) => memberId.valueOf())
          : undefined,
      participantIds:
        this.participantIds.length > 0
          ? this.participantIds.map((participantId) => participantId.valueOf())
          : undefined,
    };
  }
}
