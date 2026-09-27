import { PrivateOperationJson } from '@app/contexts/private-authorization/domain/value-objects/PrivateOperationJson';

export const PrivateAuthorizationBodyFieldLimits = Object.freeze({
  encryptedMlsState: 1_398_102,
  mlsMessage: 349_526,
  protectedMlsState: 1_398_102,
  signedJson: PrivateOperationJson.MAX_CHARACTERS,
});
