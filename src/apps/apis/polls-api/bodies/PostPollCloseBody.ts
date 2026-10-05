import { IsInt, IsObject } from 'class-validator';

export class PostPollCloseBody {
  @IsInt()
  public readonly createdAt: number;

  @IsObject()
  public readonly mutation: Record<string, unknown>;
}
