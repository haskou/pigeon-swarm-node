import DeviceAuthorizationPolicy from '@app/contexts/identity-devices/domain/services/DeviceAuthorizationPolicy';
import { DeviceAuthorizationOperationValue } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationOperation';
import { OrbitDBDeviceAuthorizationTransitionRecord } from '@app/contexts/identity-devices/infrastructure/orbitdb/documents/OrbitDBDeviceAuthorizationTransitionRecord';
import OrbitDBDeviceAuthorizationCanonicalizer from '@app/contexts/identity-devices/infrastructure/orbitdb/OrbitDBDeviceAuthorizationCanonicalizer';
import OrbitDBDeviceAuthorizationSources from '@app/contexts/identity-devices/infrastructure/orbitdb/OrbitDBDeviceAuthorizationSources';

describe(OrbitDBDeviceAuthorizationSources.name, () => {
  const sources = new OrbitDBDeviceAuthorizationSources(
    new DeviceAuthorizationPolicy(),
    new OrbitDBDeviceAuthorizationCanonicalizer(),
  );
  // Locale collation puts the lowercase value first; code-unit order puts
  // the uppercase one first. Every node must agree on the latter.
  const lowerOperationId = 'aaaaaaaa-0000-4000-8000-000000000000';
  const upperOperationId = 'BBBBBBBB-0000-4000-8000-000000000000';

  function record(
    operationId: string,
    epoch = 'epoch',
  ): OrbitDBDeviceAuthorizationTransitionRecord {
    return {
      transition: {
        epoch,
        identityId: 'identity',
        operation: DeviceAuthorizationOperationValue.ENROLL,
        operationId,
        previousRevision: 0,
        revision: 1,
        signature: 'signature',
        targetCredential: 'target',
        targetCredentialCommitment: 'commitment',
      },
    };
  }

  it('orders transition records by operation id in code-unit order', () => {
    const lower = record(lowerOperationId);
    const upper = record(upperOperationId);

    expect(sources.uniqueTransitionRecords([[lower], [upper]])).toEqual([
      upper,
      lower,
    ]);
  });

  it('breaks operation id ties by canonical encoding in code-unit order', () => {
    const lower = record(lowerOperationId, 'aaaa');
    const upper = record(lowerOperationId, 'BBBB');

    expect(sources.uniqueTransitionRecords([[lower, upper]])).toEqual([
      upper,
      lower,
    ]);
  });

  it('orders retained sources by canonical encoding in code-unit order', () => {
    const lower = { history: [record(lowerOperationId, 'aaaa')] };
    const upper = { history: [record(lowerOperationId, 'BBBB')] };

    expect(sources.canonicalSources([lower, upper])).toEqual([upper, lower]);
  });
});
