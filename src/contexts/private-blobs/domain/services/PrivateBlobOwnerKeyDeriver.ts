/**
 * Derives the pseudonymous owner key used only for quota accounting. An
 * implementation keys it with a node-local secret, so the key cannot be
 * matched against public identity keys or across nodes.
 */
export default abstract class PrivateBlobOwnerKeyDeriver {
  public abstract derive(identityId: string): Promise<string>;
}
