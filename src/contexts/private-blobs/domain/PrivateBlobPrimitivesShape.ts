import { PrivateBlobPrimitives } from './PrivateBlobPrimitives';

/**
 * Checks that a stored blob record carries every field the domain reads, so
 * a malformed record is rejected instead of being rebuilt with missing values.
 */
export class PrivateBlobPrimitivesShape {
  private static readonly fieldTypes: Record<string, string> = {
    createdAt: 'number',
    downloadTokenHash: 'string',
    expiresAt: 'number',
    id: 'string',
    ownerKey: 'string',
    retentionMs: 'number',
    size: 'number',
    uploadTokenHash: 'string',
  };

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  public static isPrivateBlobPrimitives(
    value: unknown,
  ): value is PrivateBlobPrimitives {
    if (!this.isRecord(value)) return false;

    return (
      Object.entries(this.fieldTypes).every(
        ([field, type]) => typeof value[field] === type,
      ) &&
      (value.state === 'reserved' || value.state === 'stored')
    );
  }
}
