import { PrivateAuthorizationBodyFieldLimits } from '@app/apps/apis/private-authorization-api/bodies/PrivateAuthorizationBodyFieldLimits';
import { PrivateAuthorizationRequestBodyCapacity } from '@app/apps/apis/private-authorization-api/routes/PrivateAuthorizationRequestBodyCapacity';
import { PrivateAuthorizationRequestBodyLimit } from '@app/apps/apis/private-authorization-api/routes/PrivateAuthorizationRequestBodyLimit';

describe('PrivateAuthorizationRequestBodyLimit', () => {
  it('admits maximum-length fields encoded with JSON Unicode escapes', () => {
    const maximumCharacters =
      PrivateAuthorizationBodyFieldLimits.encryptedMlsState +
      PrivateAuthorizationBodyFieldLimits.mlsMessage +
      PrivateAuthorizationBodyFieldLimits.signedJson * 3;
    const escapedEnvelopeBytes =
      maximumCharacters * 6 +
      PrivateAuthorizationRequestBodyCapacity.jsonEnvelopeOverheadBytes;

    expect(PrivateAuthorizationRequestBodyLimit).toBeGreaterThanOrEqual(
      escapedEnvelopeBytes,
    );
  });
});
