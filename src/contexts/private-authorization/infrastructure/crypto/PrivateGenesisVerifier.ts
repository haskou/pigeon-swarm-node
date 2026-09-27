import { PrivateAuthorizationGenesis } from '@app/contexts/private-authorization/application/provision-scope/PrivateAuthorizationGenesis';
import { PrivateGenesisAuthenticator } from '@app/contexts/private-authorization/application/provision-scope/PrivateGenesisAuthenticator';
import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationCheckpoint } from '@app/contexts/private-authorization/domain/PrivateAuthorizationCheckpoint';
import { PrivateProtectedMlsState } from '@app/contexts/private-authorization/domain/value-objects/PrivateProtectedMlsState';
import { PrivateGenesisSignature } from '@haskou/pigeon-swarm-crypto';
import { Buffer } from 'buffer';
import { createHash } from 'crypto';

interface VerifiedGenesisRecord {
  headHash: string;
  mlsContextHash: string;
  mlsEpoch: number;
  policy: {
    authorityKeys: string[];
    devices: Array<{ deviceKey: string; mlsCredentialHash: string }>;
    freshnessAuthorityKey: string;
  };
  revision: number;
  scopeId: string;
}

export default class PrivateGenesisVerifier extends PrivateGenesisAuthenticator {
  private hash(value: string | Buffer): string {
    return createHash('sha256').update(value).digest('base64url');
  }

  private parse(signedJson: string): Record<string, unknown> {
    const value = JSON.parse(signedJson) as unknown;

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new InvalidPrivateAuthorizationError();
    }

    return value as Record<string, unknown>;
  }

  private protectedStateHash(protectedMlsState: string): string {
    return this.hash(
      new PrivateProtectedMlsState(protectedMlsState).toBuffer(),
    );
  }

  public verify(
    signedJson: string,
    expectedOwnerDeviceKey: string,
    protectedMlsState: string,
  ): PrivateAuthorizationGenesis {
    try {
      const untrusted = this.parse(signedJson);
      const scopeId = untrusted.scopeId;
      const mlsContextHash = untrusted.mlsContextHash;

      if (typeof scopeId !== 'string' || typeof mlsContextHash !== 'string') {
        throw new InvalidPrivateAuthorizationError();
      }
      const canonical = PrivateGenesisSignature.verify(
        signedJson,
        expectedOwnerDeviceKey,
        scopeId,
        mlsContextHash,
      );
      const verified = this.parse(
        canonical,
      ) as unknown as VerifiedGenesisRecord;

      if (this.protectedStateHash(protectedMlsState) !== mlsContextHash) {
        throw new InvalidPrivateAuthorizationError();
      }
      const controlCheckpointJson = JSON.stringify({
        headHash: verified.headHash,
        mlsEpoch: verified.mlsEpoch,
        policy: verified.policy,
        revision: verified.revision,
        scopeId: verified.scopeId,
      });

      return {
        checkpoint: PrivateAuthorizationCheckpoint.genesis({
          admittedDeviceKeys: verified.policy.devices.map(
            (device) => device.deviceKey,
          ),
          authorityKeys: verified.policy.authorityKeys,
          controlCheckpointJson,
          freshnessAuthorityKey: verified.policy.freshnessAuthorityKey,
          headHash: verified.headHash,
          scopeId: verified.scopeId,
        }),
        genesisHash: this.hash(canonical),
      };
    } catch {
      throw new InvalidPrivateAuthorizationError();
    }
  }
}
