import { IsObject, IsString } from 'class-validator';

export class DeleteContentReplicationBody {
  @IsObject()
  public readonly mutation: Record<string, unknown>;

  @IsString()
  public readonly networkId: string;
}
