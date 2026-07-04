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

  private aliasKeysFromRecord(record: Record<string, unknown>): string[] {
    const keys = new Set<string>();
    const identityId =
      this.stringValue(record, 'identityId') || this.stringValue(record, 'id');
    const handle = this.stringValue(record, 'handle');
    const ownerIdentityId = this.stringValue(record, 'ownerIdentityId');
    const cid = this.stringValue(record, 'cid');
    const id = this.stringValue(record, 'id');

    if (identityId) {
      keys.add(`identity:${identityId}`);
    }

    if (handle) {
      keys.add(`identity-handle:${handle}`);
    }

    if (ownerIdentityId) {
      keys.add(`keychain:${ownerIdentityId}`);
    }

    if (ownerIdentityId && cid) {
      keys.add(`keychain-cid:${cid}`);
    }

    if (id) {
      keys.add(id);
    }

    return [...keys];
  }

  private derivedKeysFromRecord(record: Record<string, unknown>): string[] {
    const keys = new Set<string>();
    const scope = record.scope;

    if (
      this.isRecord(scope) &&
      scope.type === 'community_channel' &&
      typeof scope.communityId === 'string' &&
      typeof scope.channelId === 'string'
    ) {
      keys.add(
        `call-community-channel-head:${scope.communityId}:${scope.channelId}`,
      );
    }

    return [...keys];
  }

  public implicitKeys(record: Record<string, unknown>): string[] {
    return [
      ...new Set([
        ...this.aliasKeysFromRecord(record),
        ...this.derivedKeysFromRecord(record),
      ]),
    ];
  }

  public explicitKeys(key: string, record: Record<string, unknown>): string[] {
    return [...new Set([key, ...this.derivedKeysFromRecord(record)])];
  }

  public cachedKeys(key: string, record: Record<string, unknown>): string[] {
    return [
      ...new Set([
        key,
        ...this.aliasKeysFromRecord(record),
        ...this.derivedKeysFromRecord(record),
      ]),
    ];
  }
}
