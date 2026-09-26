import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateGenesisSignature } from '@haskou/pigeon-swarm-crypto';

export interface PrivateGenesisExpectation {
  mlsContextHash: string;
  ownerDeviceKey: string;
  scopeId: string;
}

export default class PrivateGenesisVerifier {
  public verify(
    signedJson: string,
    expectation: PrivateGenesisExpectation,
  ): string {
    try {
      return PrivateGenesisSignature.verify(
        signedJson,
        expectation.ownerDeviceKey,
        expectation.scopeId,
        expectation.mlsContextHash,
      );
    } catch {
      throw new InvalidPrivateAuthorizationError();
    }
  }
}
