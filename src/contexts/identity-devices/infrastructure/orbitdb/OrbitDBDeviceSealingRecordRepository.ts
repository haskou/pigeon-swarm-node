import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationPrimitives } from '@app/contexts/identity-devices/domain/DeviceAuthorizationPrimitives';
import {
  DEVICE_SEALING_RECORD_HEAD_PREFIX,
  DeviceSealingRecord,
} from '@app/contexts/identity-devices/domain/DeviceSealingRecord';
import { DeviceSealingRecordConflictError } from '@app/contexts/identity-devices/domain/errors/DeviceSealingRecordConflictError';
import { DeviceSealingRecordRejectedError } from '@app/contexts/identity-devices/domain/errors/DeviceSealingRecordRejectedError';
import DeviceSealingRecordPolicy from '@app/contexts/identity-devices/domain/services/DeviceSealingRecordPolicy';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

const DEVICE_AUTHORIZATION_HEAD_PREFIX = 'device-authorization:';

export default class OrbitDBDeviceSealingRecordRepository {
  private readonly policy = new DeviceSealingRecordPolicy();

  public constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly networkRegistry: IPFSNetworkRegistry,
  ) {
    this.registry.registerHeadRecordMerger(
      DEVICE_SEALING_RECORD_HEAD_PREFIX,
      (current, candidate, key) => this.merge(current, candidate, key),
      (networkId, value) =>
        this.isPrivateNetwork(networkId) ? value : undefined,
    );
  }

  public async publish(record: DeviceSealingRecord): Promise<void> {
    const admitted = this.policy.admits(
      record,
      this.authorizationOf(record.getIdentityId().valueOf()),
      new Date(Date.now()),
    );
    if (!admitted) {
      throw new DeviceSealingRecordRejectedError();
    }
    const key = record.key();
    const current = this.registry.findCachedHead(key);
    if (current) {
      if (
        DeviceSealingRecord.fromStored(current)?.getSealingPublicKey() ===
        record.getSealingPublicKey()
      ) {
        return;
      }
      throw new DeviceSealingRecordConflictError();
    }
    await this.registry.putHead(
      key,
      record.toPrimitives(),
      this.privateNetworkIds(),
    );
  }

  public findCurrent(identityId: string): DeviceSealingRecord[] {
    const authorization = this.authorizationOf(identityId);
    const now = new Date(Date.now());

    return this.registry
      .findCachedHeadsByPrefix(
        `${DEVICE_SEALING_RECORD_HEAD_PREFIX}${identityId}:`,
      )
      .map((value) => DeviceSealingRecord.fromStored(value))
      .filter(
        (record): record is DeviceSealingRecord =>
          record !== undefined &&
          this.policy.admits(record, authorization, now),
      );
  }

  private merge(
    current: Record<string, unknown> | undefined,
    candidate: Record<string, unknown>,
    key: string,
  ): Record<string, unknown> | undefined {
    const record = DeviceSealingRecord.fromStored(candidate);
    if (!record || record.key() !== key) {
      return undefined;
    }
    const admitted = this.policy.admits(
      record,
      this.authorizationOf(record.getIdentityId().valueOf()),
      new Date(Date.now()),
    );
    if (!admitted) {
      return undefined;
    }
    if (current && DeviceSealingRecord.fromStored(current)?.key() === key) {
      return current;
    }

    return record.toPrimitives();
  }

  private authorizationOf(identityId: string): DeviceAuthorization | undefined {
    const head = this.registry.findCachedHead(
      `${DEVICE_AUTHORIZATION_HEAD_PREFIX}${identityId}`,
    );
    if (!head) {
      return undefined;
    }
    try {
      return DeviceAuthorization.fromPrimitives(
        head.authorization as DeviceAuthorizationPrimitives,
      );
    } catch {
      return undefined;
    }
  }

  private privateNetworkIds(): string[] {
    return this.networkRegistry
      .getAll()
      .filter((network) => network.isPrivate())
      .map((network) => network.getId());
  }

  private isPrivateNetwork(networkId: string): boolean {
    return this.networkRegistry
      .getAll()
      .some((network) => network.getId() === networkId && network.isPrivate());
  }
}
