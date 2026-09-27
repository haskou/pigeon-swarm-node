import { PrivateAuthorizationScopeRequestBodyLimit } from '@app/apps/apis/private-authorization-api/routes/PrivateAuthorizationScopeRequestBodyLimit';
import { PrivateAuthorizationProvisioningQuota } from '@app/contexts/private-authorization/domain/PrivateAuthorizationProvisioningQuota';

describe('PrivateAuthorizationScopeRequestBodyLimit', () => {
  it('admits the owner provisioning capacity before envelope validation', () => {
    expect(PrivateAuthorizationScopeRequestBodyLimit).toBeGreaterThan(
      PrivateAuthorizationProvisioningQuota.maximumOwnerBytes().valueOf(),
    );
  });
});
