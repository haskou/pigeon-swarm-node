import { PrivateOperationDecoder } from '@app/contexts/private-authorization/application/accept-operation/PrivateOperationDecoder';
import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateControlOperation } from '@app/contexts/private-authorization/domain/PrivateControlOperation';
import { PrivateControlOperationPrimitives } from '@app/contexts/private-authorization/domain/PrivateControlOperationPrimitives';
import { PrivateOperationJson } from '@app/contexts/private-authorization/domain/value-objects/PrivateOperationJson';
import { assert } from '@haskou/value-objects';
import { Buffer } from 'buffer';
import canonicalize from 'canonicalize';
import { createHash } from 'crypto';

export default class PrivateControlOperationContract extends PrivateOperationDecoder {
  private exact(value: unknown, fields: string[]): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new InvalidPrivateAuthorizationError();
    }
    const record = value as Record<string, unknown>;

    if (
      Object.keys(record).length !== fields.length ||
      fields.some((field) => !Object.hasOwn(record, field))
    ) {
      throw new InvalidPrivateAuthorizationError();
    }

    return record;
  }

  private encoded(value: unknown, bytes: number): string {
    if (typeof value !== 'string') {
      throw new InvalidPrivateAuthorizationError();
    }
    const decoded = Buffer.from(value, 'base64url');

    if (decoded.length !== bytes || decoded.toString('base64url') !== value) {
      throw new InvalidPrivateAuthorizationError();
    }

    return value;
  }

  private text(value: unknown): string {
    if (
      typeof value !== 'string' ||
      value.length === 0 ||
      value.length > 1024
    ) {
      throw new InvalidPrivateAuthorizationError();
    }

    return value;
  }

  private mutation(value: unknown): Record<string, unknown> {
    const type =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>).type
        : undefined;

    const decoders: Record<string, () => Record<string, unknown>> = {
      'member.admit': () => this.admission(value),
      'member.ban': () => this.memberTarget(value),
      'member.remove': () => this.memberTarget(value),
      'member.roles.set': () => this.roles(value),
    };
    const decode = typeof type === 'string' ? decoders[type] : undefined;

    if (!decode) throw new InvalidPrivateAuthorizationError();

    return decode();
  }

  private admission(value: unknown): Record<string, unknown> {
    const change = this.exact(value, [
      'type',
      'identityId',
      'identityAuthorizationRevision',
      'deviceKey',
      'mlsCredentialHash',
    ]);
    this.text(change.identityId);
    this.revision(change.identityAuthorizationRevision);
    this.encoded(change.deviceKey, 32);
    this.encoded(change.mlsCredentialHash, 32);

    return change;
  }

  private memberTarget(value: unknown): Record<string, unknown> {
    const change = this.exact(value, ['type', 'targetIdentityId']);
    this.text(change.targetIdentityId);

    return change;
  }

  private roles(value: unknown): Record<string, unknown> {
    const change = this.exact(value, ['type', 'targetIdentityId', 'roleIds']);
    this.text(change.targetIdentityId);
    const roleIds = change.roleIds;
    const validRoleIds =
      Array.isArray(roleIds) &&
      roleIds.length <= 128 &&
      new Set(roleIds).size === roleIds.length &&
      roleIds.every(
        (roleId) => typeof roleId === 'string' && roleId.length > 0,
      );

    if (!validRoleIds) throw new InvalidPrivateAuthorizationError();

    return change;
  }

  private proposal(payload: unknown): {
    control: Record<string, unknown>;
    mutation: Record<string, unknown>;
  } {
    const value = this.exact(payload, [
      'proposalId',
      'parentHeadHash',
      'change',
      'authorIdentityId',
      'identityAuthorizationRevision',
    ]);

    return {
      control: {
        parentHeadHash: this.encoded(value.parentHeadHash, 32),
        proposalId: this.encoded(value.proposalId, 16),
      },
      mutation: this.mutation(value.change),
    };
  }

  private commit(payload: unknown): {
    control: Record<string, unknown>;
    mutation: Record<string, unknown>;
    proposalOperationId: string;
  } {
    const value = this.exact(payload, [
      'proposalOperationId',
      'resultingHeadHash',
      'mlsMessageHash',
      'change',
      'authorIdentityId',
      'identityAuthorizationRevision',
    ]);

    return {
      control: {
        mlsMessageHash: this.encoded(value.mlsMessageHash, 32),
        resultingHeadHash: this.encoded(value.resultingHeadHash, 32),
      },
      mutation: this.mutation(value.change),
      proposalOperationId: this.encoded(value.proposalOperationId, 16),
    };
  }

  private revocation(payload: unknown): {
    control: Record<string, unknown>;
    mutation: Record<string, unknown>;
  } {
    const value = this.exact(payload, [
      'deviceKey',
      'resultingHeadHash',
      'authorIdentityId',
      'identityAuthorizationRevision',
    ]);

    return {
      control: {
        resultingHeadHash: this.encoded(value.resultingHeadHash, 32),
      },
      mutation: {
        deviceKey: this.encoded(value.deviceKey, 32),
        type: 'device.revoke',
      },
    };
  }

  private controlPayload(kind: unknown, payload: unknown) {
    const decoders: Record<string, () => ReturnType<typeof this.proposal>> = {
      'device.revoke': () => this.revocation(payload),
      'membership.commit': () => this.commit(payload),
      'membership.propose': () => this.proposal(payload),
    };
    const decode = typeof kind === 'string' ? decoders[kind] : undefined;

    if (!decode) throw new InvalidPrivateAuthorizationError();

    return decode();
  }

  private revision(value: unknown): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
      throw new InvalidPrivateAuthorizationError();
    }

    return value as number;
  }

  private causalIds(value: unknown): string[] {
    if (
      !Array.isArray(value) ||
      value.length > 32 ||
      new Set(value).size !== value.length
    ) {
      throw new InvalidPrivateAuthorizationError();
    }

    return value.map((id) => this.encoded(id, 16));
  }

  private proposalOperationId(
    mapped: ReturnType<typeof this.proposal>,
  ): string | undefined {
    return 'proposalOperationId' in mapped &&
      typeof mapped.proposalOperationId === 'string'
      ? mapped.proposalOperationId
      : undefined;
  }

  public decode(signedJson: string): PrivateControlOperation {
    try {
      const boundedJson = new PrivateOperationJson(signedJson).valueOf();
      const value = this.exact(JSON.parse(boundedJson), [
        'version',
        'operationId',
        'scopeId',
        'authorizationRevision',
        'authorDeviceKey',
        'kind',
        'previousOperationIds',
        'payload',
        'signature',
      ]);

      if (value.version !== 1) {
        throw new InvalidPrivateAuthorizationError();
      }
      const canonical = canonicalize(value);
      assert(canonical, new InvalidPrivateAuthorizationError());
      const mapped = this.controlPayload(value.kind, value.payload);
      const payload = value.payload as Record<string, unknown>;
      const primitives: PrivateControlOperationPrimitives = {
        authorDeviceKey: this.encoded(value.authorDeviceKey, 32),
        authorIdentityId: this.text(payload.authorIdentityId),
        authorizationRevision: this.revision(value.authorizationRevision),
        byteSize: Buffer.byteLength(boundedJson, 'utf8'),
        control: mapped.control,
        digest: createHash('sha256')
          .update(canonical, 'utf8')
          .digest('base64url'),
        id: this.encoded(value.operationId, 16),
        identityAuthorizationRevision: this.revision(
          payload.identityAuthorizationRevision,
        ),
        kind: value.kind as string,
        mutation: mapped.mutation,
        previousOperationIds: this.causalIds(value.previousOperationIds),
        proposalOperationId: this.proposalOperationId(mapped),
        scopeId: this.encoded(value.scopeId, 32),
      };

      return PrivateControlOperation.fromPrimitives(primitives);
    } catch {
      throw new InvalidPrivateAuthorizationError();
    }
  }
}
