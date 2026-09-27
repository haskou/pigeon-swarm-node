import { IsString, MaxLength } from 'class-validator';

import { PrivateAuthorizationBodyFieldLimits } from './PrivateAuthorizationBodyFieldLimits';

export class PrivateControlFrameBody {
  @IsString()
  @MaxLength(PrivateAuthorizationBodyFieldLimits.encryptedMlsState)
  public readonly encryptedMlsState: string;

  @IsString()
  @MaxLength(PrivateAuthorizationBodyFieldLimits.mlsMessage)
  public readonly mlsMessage: string;

  @IsString()
  @MaxLength(PrivateAuthorizationBodyFieldLimits.signedJson)
  public readonly signedTransitionJson: string;
}
