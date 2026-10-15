import { IsArray, IsInt, IsString } from 'class-validator';

export class PutNodeBlocksBody {
  @IsString()
  public readonly type: string;

  @IsString()
  public readonly ownerIdentityId: string;

  @IsInt()
  public readonly version: number;

  @IsInt()
  public readonly issuedAt: number;

  @IsArray()
  @IsString({ each: true })
  public readonly blockedIdentityIds: string[];

  @IsArray()
  @IsString({ each: true })
  public readonly blockedNodePeerIds: string[];

  @IsString()
  public readonly identitySignature: string;
}
