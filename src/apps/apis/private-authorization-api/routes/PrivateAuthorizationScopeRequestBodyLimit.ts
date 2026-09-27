import { PrivateAuthorizationProvisioningQuota } from '@app/contexts/private-authorization/domain/PrivateAuthorizationProvisioningQuota';

import { PrivateAuthorizationBodyFieldLimits } from '../bodies/PrivateAuthorizationBodyFieldLimits';
import { PrivateAuthorizationRequestBodyCapacity } from './PrivateAuthorizationRequestBodyCapacity';

const MaximumScopeEnvelopeCharacters =
  PrivateAuthorizationBodyFieldLimits.protectedMlsState +
  PrivateAuthorizationBodyFieldLimits.signedJson;

export const PrivateAuthorizationScopeRequestBodyLimit =
  (PrivateAuthorizationProvisioningQuota.maximumOwnerBytes().valueOf() +
    MaximumScopeEnvelopeCharacters) *
    PrivateAuthorizationRequestBodyCapacity.maximumJsonBytesPerCharacter +
  PrivateAuthorizationRequestBodyCapacity.jsonEnvelopeOverheadBytes;
