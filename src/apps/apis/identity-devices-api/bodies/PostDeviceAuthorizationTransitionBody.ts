import { DeviceAuthorizationOperationValue } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationOperation';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class PostDeviceAuthorizationTransitionBody {
  @IsOptional()
  @IsString()
  public readonly authorCredential?: string;

  @IsOptional()
  @IsInt()
  public readonly authorizedAt?: number;

  @IsString()
  public readonly epoch: string;

  @IsString()
  public readonly identityId: string;

  @IsEnum(DeviceAuthorizationOperationValue)
  public readonly operation: DeviceAuthorizationOperationValue;

  @IsUUID()
  public readonly operationId: string;

  @IsOptional()
  @IsInt()
  public readonly pairingExpiration?: number;

  @IsOptional()
  @IsUUID()
  public readonly pairingId?: string;

  @IsInt()
  @Min(0)
  public readonly previousRevision: number;

  @IsOptional()
  @IsString()
  public readonly proofOfPossession?: string;

  @IsInt()
  @Min(1)
  public readonly revision: number;

  @IsString()
  public readonly signature: string;

  @IsString()
  public readonly targetCredential: string;

  @IsString()
  public readonly targetCredentialCommitment: string;
}
