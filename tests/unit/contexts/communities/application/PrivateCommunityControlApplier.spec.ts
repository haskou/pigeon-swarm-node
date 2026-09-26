import PrivateCommunityControlApplier from '@app/contexts/communities/application/apply-private-control/PrivateCommunityControlApplier';
import { Community } from '@app/contexts/communities/domain/Community';
import { PrivateAuthorizationCheckpoint } from '@app/contexts/private-authorization/domain/PrivateAuthorizationCheckpoint';
import { PrivateControlOperation } from '@app/contexts/private-authorization/domain/PrivateControlOperation';
import LegacyIdentityDeviceBinding from '@app/contexts/private-authorization/infrastructure/crypto/LegacyIdentityDeviceBinding';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';

describe('PrivateCommunityControlApplier', () => {
  const scopeId = Buffer.alloc(32, 1).toString('base64url');
  let ownerIdentityId: string;
  let ownerDeviceKey: string;
  let targetIdentityId: string;
  let projection: Record<string, unknown>;
  let checkpoint: PrivateAuthorizationCheckpoint;

  const operation = (mutation: Record<string, unknown>) =>
    PrivateControlOperation.fromPrimitives({
      authorDeviceKey: ownerDeviceKey,
      authorizationRevision: 0,
      byteSize: 1,
      digest: 'digest',
      id: 'operation',
      kind: 'membership.propose',
      mutation,
      previousOperationIds: [],
      scopeId,
    });

  beforeEach(async () => {
    const binding = new LegacyIdentityDeviceBinding();
    const owner = await KeyPair.generate();
    const target = await KeyPair.generate();
    ownerIdentityId = owner.toPrimitives().publicKey.replace(
      /-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,
      '',
    );
    targetIdentityId = target.toPrimitives().publicKey.replace(
      /-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,
      '',
    );
    ownerDeviceKey = binding.bind(ownerIdentityId);
    checkpoint = PrivateAuthorizationCheckpoint.genesis({
      admittedDeviceKeys: [ownerDeviceKey],
      authorityKeys: [ownerDeviceKey],
      headHash: Buffer.alloc(32, 2).toString('base64url'),
      scopeId,
    });
    projection = Community.fromPrimitives({
      autoJoinEnabled: false,
      avatar: undefined,
      bannedMemberIds: [],
      banner: undefined,
      createdAt: Date.now(),
      description: 'Private community',
      discoverable: false,
      id: scopeId,
      memberIds: [ownerIdentityId, targetIdentityId],
      memberRoles: [],
      name: 'Private',
      networkId: '550e8400-e29b-41d4-a716-446655440000',
      ownerIdentityId,
      roles: [],
      textChannels: [],
      visibility: 'private',
      voiceChannels: [],
    }).toPrimitives();
  });

  it('applies a ban through the existing community permission rules', async () => {
    const result = await new PrivateCommunityControlApplier(
      new LegacyIdentityDeviceBinding(),
    ).apply(
      checkpoint,
      operation({ targetIdentityId, type: 'member.ban' }),
      projection,
    );

    expect(result.bannedMemberIds).toContain(targetIdentityId);
    expect(result.memberIds).not.toContain(targetIdentityId);
  });

  it('applies complete role assignment and removal through the aggregate', async () => {
    const applier = new PrivateCommunityControlApplier(
      new LegacyIdentityDeviceBinding(),
    );
    const roleId = '550e8400-e29b-41d4-a716-446655440001';
    projection = {
      ...projection,
      roles: [
        { id: roleId, name: 'Moderator', permissions: ['manage_members'] },
      ],
    };
    const assigned = await applier.apply(
      checkpoint,
      operation({ roleIds: [roleId], targetIdentityId, type: 'member.roles.set' }),
      projection,
    );
    const removed = await applier.apply(
      checkpoint,
      operation({ targetIdentityId, type: 'member.remove' }),
      assigned,
    );

    expect(assigned.memberRoles).toContainEqual({
      identityId: targetIdentityId,
      roleIds: [roleId],
    });
    expect(removed.memberIds).not.toContain(targetIdentityId);
  });

  it('does not change community projection for a device-only revocation', async () => {
    await expect(
      new PrivateCommunityControlApplier(
        new LegacyIdentityDeviceBinding(),
      ).apply(
        checkpoint,
        operation({ deviceKey: ownerDeviceKey, type: 'device.revoke' }),
        projection,
      ),
    ).resolves.toEqual(projection);
  });

  it('applies identical community permission checks to any accepted ingress', async () => {
    const member = await KeyPair.generate();
    const memberIdentityId = member.toPrimitives().publicKey.replace(
      /-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,
      '',
    );
    const binding = new LegacyIdentityDeviceBinding();
    const memberDeviceKey = binding.bind(memberIdentityId);
    const memberCheckpoint = PrivateAuthorizationCheckpoint.genesis({
      admittedDeviceKeys: [memberDeviceKey],
      authorityKeys: [memberDeviceKey],
      headHash: Buffer.alloc(32, 2).toString('base64url'),
      scopeId,
    });
    projection = {
      ...projection,
      memberIds: [...(projection.memberIds as string[]), memberIdentityId],
    };
    const unauthorized = PrivateControlOperation.fromPrimitives({
      ...operation({ targetIdentityId, type: 'member.ban' }).toPrimitives(),
      authorDeviceKey: memberDeviceKey,
    });

    await expect(
      new PrivateCommunityControlApplier(binding).apply(
        memberCheckpoint,
        unauthorized,
        projection,
      ),
    ).rejects.toThrow('Community permission denied');
  });
});
