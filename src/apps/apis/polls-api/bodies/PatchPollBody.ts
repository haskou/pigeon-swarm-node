import { IsIn, IsInt, IsObject } from 'class-validator';

export class PatchPollBody {
  @IsInt()
  public readonly createdAt: number;

  @IsObject()
  public readonly mutation: Record<string, unknown>;

  /** The only transition a poll accepts: open to closed. */
  @IsIn(['closed'])
  public readonly status: 'closed';
}
