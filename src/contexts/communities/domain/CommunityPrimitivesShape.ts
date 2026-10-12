import { PrimitiveOf } from '@haskou/value-objects';

import { Community } from './Community';

/**
 * Checks that a stored community projection carries every primitive that
 * Community.fromPrimitives reads without a domain default, so malformed records
 * are rejected instead of being rebuilt with replacement values. Keys that the
 * reader replaces when absent or falsy are accepted in those forms.
 */
export class CommunityPrimitivesShape {
  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private static isArrayOf(
    value: unknown,
    isItem: (item: unknown) => boolean,
  ): boolean {
    return Array.isArray(value) && value.every((item) => isItem(item));
  }

  private static isStringArray(value: unknown): boolean {
    return this.isArrayOf(value, (item) => typeof item === 'string');
  }

  private static isFalsyOr(
    value: unknown,
    isValid: (item: unknown) => boolean,
  ): boolean {
    return !value || isValid(value);
  }

  private static isNullishOr(
    value: unknown,
    isValid: (item: unknown) => boolean,
  ): boolean {
    return value === undefined || value === null || isValid(value);
  }

  private static isMemberRole(value: unknown): boolean {
    return (
      this.isRecord(value) &&
      typeof value.identityId === 'string' &&
      this.isStringArray(value.roleIds)
    );
  }

  private static isRole(value: unknown): boolean {
    return (
      this.isRecord(value) &&
      typeof value.builtIn === 'boolean' &&
      typeof value.id === 'string' &&
      typeof value.name === 'string' &&
      this.isStringArray(value.permissions)
    );
  }

  private static isChannel(value: unknown): boolean {
    return (
      this.isRecord(value) &&
      typeof value.createdAt === 'number' &&
      typeof value.id === 'string' &&
      typeof value.name === 'string' &&
      this.isFalsyOr(
        value.permissions,
        (permissions) =>
          this.isRecord(permissions) &&
          this.isFalsyOr(permissions.visibleRoleIds, (visibleRoleIds) =>
            this.isStringArray(visibleRoleIds),
          ),
      )
    );
  }

  private static hasSettings(value: Record<string, unknown>): boolean {
    return (
      this.isNullishOr(
        value.autoJoinEnabled,
        (item) => typeof item === 'boolean',
      ) &&
      this.isNullishOr(
        value.discoverable,
        (item) => typeof item === 'boolean',
      ) &&
      this.isNullishOr(value.visibility, (item) => typeof item === 'string')
    );
  }

  private static hasProfile(value: Record<string, unknown>): boolean {
    return (
      this.isFalsyOr(value.avatar, (item) => typeof item === 'string') &&
      this.isFalsyOr(value.banner, (item) => typeof item === 'string') &&
      typeof value.description === 'string' &&
      typeof value.name === 'string'
    );
  }

  private static hasCoreFields(value: Record<string, unknown>): boolean {
    return (
      typeof value.createdAt === 'number' &&
      typeof value.id === 'string' &&
      typeof value.networkId === 'string' &&
      typeof value.ownerIdentityId === 'string'
    );
  }

  private static hasMembers(value: Record<string, unknown>): boolean {
    return (
      this.isFalsyOr(value.bannedMemberIds, (item) =>
        this.isStringArray(item),
      ) &&
      this.isStringArray(value.memberIds) &&
      this.isFalsyOr(value.memberRoles, (items) =>
        this.isArrayOf(items, (item) => this.isMemberRole(item)),
      )
    );
  }

  private static hasRoles(value: Record<string, unknown>): boolean {
    return this.isNullishOr(value.roles, (items) =>
      this.isArrayOf(items, (item) => this.isRole(item)),
    );
  }

  private static hasChannels(value: Record<string, unknown>): boolean {
    return (
      this.isArrayOf(value.textChannels, (item) => this.isChannel(item)) &&
      this.isFalsyOr(value.voiceChannels, (items) =>
        this.isArrayOf(items, (item) => this.isChannel(item)),
      )
    );
  }

  public static isCommunityPrimitives(
    value: unknown,
  ): value is PrimitiveOf<Community> {
    return (
      this.isRecord(value) &&
      this.hasSettings(value) &&
      this.hasProfile(value) &&
      this.hasCoreFields(value) &&
      this.hasMembers(value) &&
      this.hasRoles(value) &&
      this.hasChannels(value)
    );
  }
}
