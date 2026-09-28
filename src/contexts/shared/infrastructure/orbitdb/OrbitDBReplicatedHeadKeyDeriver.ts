export default class OrbitDBReplicatedHeadKeyDeriver {
  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private stringValue(
    document: Record<string, unknown>,
    attribute: string,
  ): string | undefined {
    const value = document[attribute];

    return typeof value === 'string' ? value : undefined;
  }

  private identityRecordFrom(
    document: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    const identity = document.identity;

    return this.isRecord(identity) ? identity : undefined;
  }

  private isProjectedIdentityRecord(record: Record<string, unknown>): boolean {
    return (
      Boolean(this.stringValue(record, 'cid')) &&
      Boolean(this.stringValue(record, 'id')) &&
      Boolean(this.stringValue(record, 'lastEventId'))
    );
  }

  private identityIdFrom(record: Record<string, unknown>): string | undefined {
    const identityId = this.stringValue(record, 'identityId');
    const identityRecord = this.identityRecordFrom(record);
    const embeddedIdentityId = identityRecord
      ? this.stringValue(identityRecord, 'id')
      : undefined;
    const projectedIdentityId = this.isProjectedIdentityRecord(record)
      ? this.stringValue(record, 'id')
      : undefined;

    if (identityId && embeddedIdentityId && identityId !== embeddedIdentityId) {
      return undefined;
    }

    return identityId || embeddedIdentityId || projectedIdentityId;
  }

  private addAlias(
    keys: Set<string>,
    prefix: string,
    value: string | undefined,
  ): void {
    if (value) {
      keys.add(`${prefix}${value}`);
    }
  }

  private addScopedAlias(
    keys: Set<string>,
    prefix: string,
    value: string | undefined,
    scope: string | undefined,
  ): void {
    if (value && scope) {
      keys.add(`${prefix}${value}`);
    }
  }

  private aliasKeysFromRecord(record: Record<string, unknown>): string[] {
    const keys = new Set<string>();
    const identityId = this.identityIdFrom(record);
    const handle = this.stringValue(record, 'handle');
    const ownerIdentityId = this.stringValue(record, 'ownerIdentityId');
    const cid = this.stringValue(record, 'cid');
    const id = this.stringValue(record, 'id');

    this.addAlias(keys, 'identity:', identityId);
    this.addScopedAlias(keys, 'identity-handle:', handle, identityId);
    this.addAlias(keys, 'keychain:', ownerIdentityId);
    this.addScopedAlias(keys, 'keychain-cid:', cid, ownerIdentityId);
    this.addAlias(keys, '', id);

    return [...keys];
  }

  public implicitKeys(record: Record<string, unknown>): string[] {
    return [...new Set(this.aliasKeysFromRecord(record))];
  }

  public cachedKeys(key: string, record: Record<string, unknown>): string[] {
    return [...new Set([key, ...this.aliasKeysFromRecord(record)])];
  }
}
