import { PrivateBlob } from '../PrivateBlob';

export default abstract class PrivateBlobRepository {
  public abstract delete(id: string): Promise<void>;

  public abstract findById(id: string): Promise<PrivateBlob | undefined>;

  /** Blobs whose deadline passed, reserved or stored. */
  public abstract findExpired(now: number): Promise<PrivateBlob[]>;

  /**
   * Pseudonymous owner key used only for quota accounting. It is salted per
   * node, so it cannot be matched against public identity keys.
   */
  public abstract ownerKeyFor(identityId: string): Promise<string>;

  public abstract save(blob: PrivateBlob): Promise<void>;

  /** Sum of reserved sizes of live blobs, optionally for one owner. */
  public abstract reservedBytes(
    now: number,
    ownerKey?: string,
  ): Promise<number>;
}
