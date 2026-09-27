import { IsObject, IsString, MaxLength } from 'class-validator';

import { PrivateAuthorizationBodyFieldLimits } from './PrivateAuthorizationBodyFieldLimits';

export class PostPrivateAuthorizationScopeBody {
  @IsObject()
  public readonly projection: Record<string, unknown>;

  @IsString()
  @MaxLength(PrivateAuthorizationBodyFieldLimits.protectedMlsState)
  public readonly protectedMlsState: string;

  @IsString()
  @MaxLength(PrivateAuthorizationBodyFieldLimits.signedJson)
  public readonly signedGenesisJson: string;
}
