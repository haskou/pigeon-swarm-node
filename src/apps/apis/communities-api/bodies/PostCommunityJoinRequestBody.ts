import { IsInt, IsObject, IsOptional, Min } from 'class-validator';

export class PostCommunityJoinRequestBody {
  @IsOptional()
  @IsObject()
  public readonly acceptedMutation?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  public readonly acceptedAt?: number;

  @IsInt()
  @Min(0)
  public readonly createdAt: number;

  @IsObject()
  public readonly mutation: Record<string, unknown>;
}
