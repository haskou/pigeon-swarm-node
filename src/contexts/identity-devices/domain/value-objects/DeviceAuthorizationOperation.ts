import { Enum } from '@haskou/value-objects';

export enum DeviceAuthorizationOperationValue {
  ENROLL = 'enroll',
  RECOVER = 'recover',
  REVOKE = 'revoke',
}

export class DeviceAuthorizationOperation extends Enum<DeviceAuthorizationOperationValue> {
  public static enrollment(): DeviceAuthorizationOperation {
    return new DeviceAuthorizationOperation(
      DeviceAuthorizationOperationValue.ENROLL,
    );
  }

  public static recovery(): DeviceAuthorizationOperation {
    return new DeviceAuthorizationOperation(
      DeviceAuthorizationOperationValue.RECOVER,
    );
  }

  public static revocation(): DeviceAuthorizationOperation {
    return new DeviceAuthorizationOperation(
      DeviceAuthorizationOperationValue.REVOKE,
    );
  }

  public isEnrollment(): boolean {
    return this.valueOf() === DeviceAuthorizationOperationValue.ENROLL;
  }

  public isRecovery(): boolean {
    return this.valueOf() === DeviceAuthorizationOperationValue.RECOVER;
  }

  public isRevocation(): boolean {
    return this.valueOf() === DeviceAuthorizationOperationValue.REVOKE;
  }

  public getValues(): DeviceAuthorizationOperationValue[] {
    return Object.values(DeviceAuthorizationOperationValue);
  }
}
