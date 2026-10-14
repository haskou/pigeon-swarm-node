import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class PollAudience {
  public static communityMembers(memberIds: IdentityId[]): PollAudience {
    return new PollAudience(memberIds);
  }

  public static communityChannel(): PollAudience {
    return new PollAudience([]);
  }

  public static empty(): PollAudience {
    return new PollAudience([]);
  }

  private constructor(private readonly memberIds: IdentityId[]) {}

  public toPrimitives(): {
    memberIds?: string[];
  } {
    return {
      memberIds:
        this.memberIds.length > 0
          ? this.memberIds.map((memberId) => memberId.valueOf())
          : undefined,
    };
  }
}
