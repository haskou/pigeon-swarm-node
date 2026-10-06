import { IsIn, IsInt, IsObject, IsString, Min } from 'class-validator';

export class PutContentReplicationBody {
  @IsIn(['ipfs_private_upload', 'ipfs_public_upload'])
  public readonly context: string;

  @IsObject()
  public readonly mutation: Record<string, unknown>;

  @IsString()
  public readonly networkId: string;

  @IsInt()
  @Min(1)
  public readonly sizeBytes: number;
}
