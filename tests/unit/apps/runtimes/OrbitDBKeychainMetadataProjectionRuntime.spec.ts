import OrbitDBKeychainMetadataProjectionRuntime from '@app/apps/runtimes/orbitdb-keychain-metadata-projection-runtime/OrbitDBKeychainMetadataProjectionRuntime';
import OrbitDBKeychainMetadataProjection from '@app/contexts/keychains/infrastructure/orbitdb/OrbitDBKeychainMetadataProjection';
import { mock } from 'jest-mock-extended';

describe('OrbitDBKeychainMetadataProjectionRuntime', () => {
  it('starts the keychain metadata projection', async () => {
    const projection = mock<OrbitDBKeychainMetadataProjection>();
    const runtime = new OrbitDBKeychainMetadataProjectionRuntime(projection);

    await runtime.run();

    expect(projection.start).toHaveBeenCalledTimes(1);
  });
});
