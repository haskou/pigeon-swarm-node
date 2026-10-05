import { IsInt, IsObject, Min } from 'class-validator';

/** The client-signed `moderationLogs` put that accompanies a moderation action. */
export class CommunityModerationLogBody {
  @IsInt()
  @Min(0)
  public readonly createdAt: number;

  @IsObject()
  public readonly mutation: Record<string, unknown>;
}
