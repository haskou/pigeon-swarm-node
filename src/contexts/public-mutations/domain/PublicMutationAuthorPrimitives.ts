export interface PublicMutationAuthorPrimitives {
  /**
   * Revision of the identity's device-authorization chain that the signing
   * device observed when it signed. The device must be authorized at exactly
   * that revision, never only at the current head.
   */
  authorizationRevision: number;
  identityId: string;
  deviceCredential: string;
}
