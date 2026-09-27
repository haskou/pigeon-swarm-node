import { IsInt, IsObject, IsString, MaxLength, Min } from 'class-validator';

import { PrivateAuthorizationBodyFieldLimits } from './PrivateAuthorizationBodyFieldLimits';

export class PostPrivateAuthorizationScopeBody {
  @IsInt()
  @Min(0)
  public readonly identityAuthorizationRevision: number;

  @IsString()
  public readonly ownerDeviceKey: string;

  @IsObject()
  public readonly projection: Record<string, unknown>;

  @IsString()
  @MaxLength(PrivateAuthorizationBodyFieldLimits.protectedMlsState)
  public readonly protectedMlsState: string;

  @IsString()
  @MaxLength(PrivateAuthorizationBodyFieldLimits.signedJson)
  public readonly signedGenesisJson: string;
}
