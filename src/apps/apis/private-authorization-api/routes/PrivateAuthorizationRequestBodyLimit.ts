import { PrivateAuthorizationBodyFieldLimits } from '../bodies/PrivateAuthorizationBodyFieldLimits';

const MaximumUtf8BytesPerCharacter = 4;
const JsonEnvelopeOverheadBytes = 4 * 1024;
const MaximumOperationEnvelopeCharacters =
  PrivateAuthorizationBodyFieldLimits.encryptedMlsState +
  PrivateAuthorizationBodyFieldLimits.mlsMessage +
  PrivateAuthorizationBodyFieldLimits.signedJson * 3;

export const PrivateAuthorizationRequestBodyLimit =
  MaximumOperationEnvelopeCharacters * MaximumUtf8BytesPerCharacter +
  JsonEnvelopeOverheadBytes;
