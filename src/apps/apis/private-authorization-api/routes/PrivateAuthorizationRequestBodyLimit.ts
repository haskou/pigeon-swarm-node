import { PrivateAuthorizationBodyFieldLimits } from '../bodies/PrivateAuthorizationBodyFieldLimits';
import { PrivateAuthorizationRequestBodyCapacity } from './PrivateAuthorizationRequestBodyCapacity';

const MaximumOperationEnvelopeCharacters =
  PrivateAuthorizationBodyFieldLimits.encryptedMlsState +
  PrivateAuthorizationBodyFieldLimits.mlsMessage +
  PrivateAuthorizationBodyFieldLimits.signedJson * 3;

export const PrivateAuthorizationRequestBodyLimit =
  MaximumOperationEnvelopeCharacters *
    PrivateAuthorizationRequestBodyCapacity.maximumUtf8BytesPerCharacter +
  PrivateAuthorizationRequestBodyCapacity.jsonEnvelopeOverheadBytes;
