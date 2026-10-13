import { InsufficientIdentityAdmissionProofError } from '@app/contexts/identities/domain/errors/InsufficientIdentityAdmissionProofError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';

/** 400 body telling the client how many leading zero bits to mine before retrying. */
export class InsufficientAdmissionProofViewModel {
  constructor(
    private readonly error: InsufficientIdentityAdmissionProofError,
  ) {}

  public toResource(): {
    code: string;
    errors: never[];
    httpStatus: number;
    message: string;
    requiredDifficultyBits: number;
  } {
    return {
      code: 'BadRequestError',
      errors: [],
      httpStatus: HttpRouteStatusEnum.BAD_REQUEST,
      message: this.error.message,
      requiredDifficultyBits: this.error.requiredDifficultyBits,
    };
  }
}
