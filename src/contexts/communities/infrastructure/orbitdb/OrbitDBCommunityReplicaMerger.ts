import { randomUUID } from 'node:crypto';

import { OrbitDBCommunityDocument } from './documents/OrbitDBCommunityDocument';
import { OrbitDBCommunityReplicaAssignment } from './documents/OrbitDBCommunityReplicaAssignment';
import { OrbitDBCommunityReplicaRegister } from './documents/OrbitDBCommunityReplicaRegister';
import { OrbitDBCommunityReplicaState } from './documents/OrbitDBCommunityReplicaState';
import { OrbitDBCommunityReplicaWrite } from './documents/OrbitDBCommunityReplicaWrite';

export default class OrbitDBCommunityReplicaMerger {
  private readonly profileFields = [
    'autoJoinEnabled',
    'avatar',
    'banner',
    'description',
    'discoverable',
    'name',
    'visibility',
  ];

  private readonly collections = [
    'memberIds',
    'bannedMemberIds',
    'roles',
    'textChannels',
    'voiceChannels',
    'memberRoles',
  ];

  private canonical(value: unknown): string {
    if (Array.isArray(value))
      return `[${value.map((item) => this.canonical(item)).join(',')}]`;

    if (value !== null && typeof value === 'object') {
      return `{${Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => `${JSON.stringify(key)}:${this.canonical(item)}`)
        .join(',')}}`;
    }

    return JSON.stringify(value ?? null);
  }

  private key(field: string, id = ''): string {
    return JSON.stringify([field, id]);
  }

  private collectionElements(
    field: string,
    values: unknown,
  ): Array<[string, unknown]> {
    if (!Array.isArray(values)) return [];

    return values.map((value) => {
      const id = this.elementId(field, value);

      if (typeof id !== 'string')
        throw new Error('Invalid community replica element');

      return [this.key(field, id), structuredClone(value)];
    });
  }

  private elementId(field: string, value: unknown): unknown {
    if (typeof value === 'string') return value;
    const element = value as { identityId: unknown; id: unknown };

    return field === 'memberRoles' ? element.identityId : element.id;
  }

  private elements(document: OrbitDBCommunityDocument): Map<string, unknown> {
    const result = new Map<string, unknown>();
    for (const field of this.profileFields) {
      if (document[field] !== undefined)
        result.set(this.key(field), document[field]);
    }
    for (const field of this.collections) {
      for (const [key, value] of this.collectionElements(
        field,
        document[field],
      ))
        result.set(key, value);
    }

    return result;
  }

  private validatePath(key: string): void {
    const path: unknown = JSON.parse(key);

    if (
      !Array.isArray(path) ||
      path.length !== 2 ||
      path.some((item) => typeof item !== 'string') ||
      ![...this.profileFields, ...this.collections].includes(path[0] as string)
    )
      throw new Error('Invalid community replica path');
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private strings(value: unknown): value is string[] {
    return (
      Array.isArray(value) && value.every((item) => typeof item === 'string')
    );
  }

  private validChannel(field: string, value: Record<string, unknown>): boolean {
    const permissions = value.permissions;

    return (
      typeof value.createdAt === 'number' &&
      Number.isFinite(value.createdAt) &&
      value.type === (field === 'textChannels' ? 'text' : 'voice') &&
      (permissions === undefined ||
        (this.isRecord(permissions) &&
          this.strings(permissions.visibleRoleIds)))
    );
  }

  private validRole(value: Record<string, unknown>): boolean {
    return (
      typeof value.builtIn === 'boolean' && this.strings(value.permissions)
    );
  }

  private validAdmission(value: unknown): boolean {
    return typeof value === 'string' && value.length > 0;
  }

  private validAssignment(id: string, value: Record<string, unknown>): boolean {
    return (
      value.identityId === id &&
      typeof value.admission === 'string' &&
      this.strings(value.roleIds)
    );
  }

  private validElement(field: string, id: string, value: unknown): boolean {
    if (field === 'bannedMemberIds') return value === id;

    if (!this.isRecord(value)) return false;

    if (field === 'memberRoles') return this.validAssignment(id, value);

    if (value.id !== id) return false;

    if (field === 'memberIds') return this.validAdmission(value.admission);

    if (typeof value.name !== 'string') return false;

    if (field === 'roles') return this.validRole(value);

    return this.validChannel(field, value);
  }

  private validProfile(field: string, value: unknown): boolean {
    if (['autoJoinEnabled', 'discoverable'].includes(field))
      return typeof value === 'boolean';

    if (field === 'visibility')
      return value === 'private' || value === 'public';

    return typeof value === 'string';
  }

  private validateValue(
    key: string,
    entry: OrbitDBCommunityReplicaRegister,
  ): void {
    const [field, id] = JSON.parse(key) as string[];
    const profile = this.profileFields.includes(field);

    if (
      JSON.stringify([field, id]) !== key ||
      (profile ? id !== '' : id === '')
    )
      throw new Error('Invalid community replica path');

    if (entry.removed) return;
    const valid = profile
      ? this.validProfile(field, entry.value)
      : this.validElement(field, id, entry.value);

    if (!valid) throw new Error('Invalid community replica value');
  }

  private validateRegister(entry: OrbitDBCommunityReplicaRegister): void {
    if (
      !entry ||
      !Number.isSafeInteger(entry.revision) ||
      entry.revision < 0 ||
      typeof entry.removed !== 'boolean'
    )
      throw new Error('Invalid community replica revision');
  }

  private validateState(state: OrbitDBCommunityReplicaState): void {
    if (
      state.version !== 1 ||
      !state.entries ||
      typeof state.entries !== 'object' ||
      Array.isArray(state.entries)
    )
      throw new Error('Unsupported community replica state');
    for (const [key, entry] of Object.entries(state.entries)) {
      this.validatePath(key);
      this.validateRegister(entry);
      this.validateValue(key, entry);
    }
  }

  private state(
    document: OrbitDBCommunityDocument,
  ): OrbitDBCommunityReplicaState {
    if (document.replicaState !== undefined) {
      this.validateState(document.replicaState);

      return structuredClone(document.replicaState);
    }

    return {
      entries: Object.fromEntries(
        [...this.elements(document)].map(([key, value]) => [
          key,
          { removed: false, revision: 0, value: this.initialValue(key, value) },
        ]),
      ),
      version: 1,
    };
  }

  private initialValue(key: string, value: unknown): unknown {
    const [field, id] = JSON.parse(key) as string[];

    if (field === 'memberIds') return { admission: `legacy:${id}`, id };

    if (field === 'memberRoles')
      return { ...(value as object), admission: `legacy:${id}` };

    return value;
  }

  private sameScope(
    left: OrbitDBCommunityDocument,
    right: OrbitDBCommunityDocument,
  ): void {
    for (const field of ['id', 'networkId', 'ownerIdentityId', 'createdAt']) {
      if (left[field] !== right[field])
        throw new Error('Community replica scope mismatch');
    }
  }

  private terminalCollection(field: string): boolean {
    return ['roles', 'textChannels', 'voiceChannels'].includes(field);
  }

  private assignmentWinner(
    left: OrbitDBCommunityReplicaRegister,
    right: OrbitDBCommunityReplicaRegister,
  ): OrbitDBCommunityReplicaRegister | undefined {
    const a = left.value as OrbitDBCommunityReplicaAssignment;
    const b = right.value as OrbitDBCommunityReplicaAssignment;

    if (a.admission !== b.admission) return undefined;

    return {
      ...left,
      value: {
        ...a,
        roleIds: a.roleIds.filter((id) => b.roleIds.includes(id)).sort(),
      },
    };
  }

  private tiedWinner(
    field: string,
    left: OrbitDBCommunityReplicaRegister,
    right: OrbitDBCommunityReplicaRegister,
  ): OrbitDBCommunityReplicaRegister {
    if (left.removed !== right.removed) return left.removed ? left : right;

    if (field === 'memberRoles' && !left.removed) {
      const assignment = this.assignmentWinner(left, right);

      if (assignment) return assignment;
    }

    return this.canonical(left.value) <= this.canonical(right.value)
      ? left
      : right;
  }

  private winner(
    key: string,
    left: OrbitDBCommunityReplicaRegister,
    right: OrbitDBCommunityReplicaRegister,
  ): OrbitDBCommunityReplicaRegister {
    const [field] = JSON.parse(key) as string[];

    if (this.terminalCollection(field) && left.removed !== right.removed)
      return left.removed ? left : right;

    if (left.revision !== right.revision)
      return left.revision > right.revision ? left : right;

    return this.tiedWinner(field, left, right);
  }

  private projectEntry(
    result: OrbitDBCommunityDocument,
    admissions: Map<string, string>,
    key: string,
    entry: OrbitDBCommunityReplicaRegister,
  ): void {
    const [field, id] = JSON.parse(key) as string[];

    if (this.profileFields.includes(field))
      Object.assign(result, { [field]: structuredClone(entry.value) });
    else if (field === 'memberIds') {
      const value = entry.value as { admission: string };
      admissions.set(id, value.admission);
      result.memberIds.push(id);
    } else (result[field] as unknown[]).push(structuredClone(entry.value));
  }

  private projectEntries(
    result: OrbitDBCommunityDocument,
    state: OrbitDBCommunityReplicaState,
    admissions: Map<string, string>,
  ): void {
    for (const [key, entry] of Object.entries(state.entries).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )) {
      if (entry.removed) continue;
      this.projectEntry(result, admissions, key, entry);
    }
  }

  private filterMembership(
    result: OrbitDBCommunityDocument,
    admissions: Map<string, string>,
  ): void {
    const banned = new Set(result.bannedMemberIds);
    Object.assign(result, {
      memberIds: result.memberIds.filter((id) => !banned.has(id)),
    });
    const roles = new Set(result.roles?.map((role) => role.id));
    Object.assign(result, {
      memberRoles: (result.memberRoles as OrbitDBCommunityReplicaAssignment[])
        .filter(
          (assignment) =>
            result.memberIds.includes(assignment.identityId) &&
            admissions.get(assignment.identityId) === assignment.admission,
        )
        .map((assignment) => ({
          identityId: assignment.identityId,
          roleIds: assignment.roleIds.filter((id) => roles.has(id)).sort(),
        })),
    });
  }

  private filterChannelRoles(result: OrbitDBCommunityDocument): void {
    const roles = new Set(result.roles?.map((role) => role.id));
    for (const channel of [
      ...result.textChannels,
      ...(result.voiceChannels ?? []),
    ]) {
      if (channel.permissions)
        channel.permissions.visibleRoleIds =
          channel.permissions.visibleRoleIds.filter((id) => roles.has(id));
    }
  }

  private project(
    document: OrbitDBCommunityDocument,
    state: OrbitDBCommunityReplicaState,
  ): OrbitDBCommunityDocument {
    const result: OrbitDBCommunityDocument = {
      createdAt: document.createdAt,
      description: '',
      id: document.id,
      memberIds: [],
      name: '',
      networkId: document.networkId,
      ownerIdentityId: document.ownerIdentityId,
      replicaState: state,
      textChannels: [],
      updatedAt: document.updatedAt,
      visibility: 'private',
    };
    for (const field of this.collections) result[field] = [];
    const admissions = new Map<string, string>();
    this.projectEntries(result, state, admissions);
    result.textChannels.sort(
      (a, b) =>
        a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    result.voiceChannels?.sort(
      (a, b) =>
        a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    this.filterMembership(result, admissions);
    this.filterChannelRoles(result);

    if (document.deleted) {
      result.deleted = true;
      result.deletedAt = document.deletedAt;
    }

    return result;
  }

  private legacyWinner(
    current: OrbitDBCommunityDocument,
    candidate: OrbitDBCommunityDocument,
  ): OrbitDBCommunityDocument {
    const a = current.updatedAt ?? current.createdAt;
    const b = candidate.updatedAt ?? candidate.createdAt;

    if (a !== b) return a > b ? current : candidate;

    return this.canonical(current) <= this.canonical(candidate)
      ? current
      : candidate;
  }

  private mergedEntries(
    left: OrbitDBCommunityReplicaState,
    right: OrbitDBCommunityReplicaState,
  ): OrbitDBCommunityReplicaState['entries'] {
    const entries: OrbitDBCommunityReplicaState['entries'] = {};
    for (const key of [
      ...new Set([...Object.keys(left.entries), ...Object.keys(right.entries)]),
    ].sort()) {
      const a = left.entries[key];
      const b = right.entries[key];
      entries[key] = a && b ? this.winner(key, a, b) : (a ?? b);
    }

    return entries;
  }

  private mergedMetadata(
    current: OrbitDBCommunityDocument,
    candidate: OrbitDBCommunityDocument,
  ): OrbitDBCommunityDocument {
    const deleted = current.deleted === true || candidate.deleted === true;

    return {
      ...current,
      deleted,
      updatedAt: Math.max(current.updatedAt ?? 0, candidate.updatedAt ?? 0),
      ...(deleted
        ? {
            deletedAt: Math.max(
              current.deletedAt ?? 0,
              candidate.deletedAt ?? 0,
            ),
          }
        : {}),
    };
  }

  private validateUpdate(
    next: OrbitDBCommunityDocument,
    baseline: OrbitDBCommunityDocument | undefined,
    previous: OrbitDBCommunityDocument | undefined,
  ): void {
    if (previous) this.sameScope(next, previous);

    if (baseline) this.sameScope(next, baseline);

    if (previous?.deleted) throw new Error('Cannot update a deleted community');

    if (previous && !baseline)
      throw new Error('Community update requires its loaded baseline');
  }

  private nextRevision(
    key: string,
    baselineState: OrbitDBCommunityReplicaState | undefined,
  ): number {
    const revision = (baselineState?.entries[key]?.revision ?? 0) + 1;

    if (!Number.isSafeInteger(revision))
      throw new Error('Community replica revision exhausted');

    return revision;
  }

  private changeElement(
    key: string,
    value: unknown,
    state: OrbitDBCommunityReplicaState,
    baselineState: OrbitDBCommunityReplicaState | undefined,
  ): void {
    const [field, id] = JSON.parse(key) as string[];

    if (state.entries[key]?.removed && this.terminalCollection(field)) return;
    const revision = this.nextRevision(key, baselineState);
    const entries = state.entries;
    const candidate: OrbitDBCommunityReplicaRegister = {
      removed: value === undefined,
      revision,
      value:
        field === 'memberIds' && value !== undefined
          ? { admission: randomUUID(), id }
          : (value ?? null),
    };
    entries[key] = entries[key]
      ? this.winner(key, entries[key], candidate)
      : candidate;
  }

  private changeAssignment(
    key: string,
    value: unknown,
    before: Map<string, unknown>,
    state: OrbitDBCommunityReplicaState,
    baselineState: OrbitDBCommunityReplicaState | undefined,
  ): void {
    const [, id] = JSON.parse(key) as string[];
    const membershipKey = this.key('memberIds', id);
    const membership = before.has(membershipKey)
      ? baselineState?.entries[membershipKey]
      : state.entries[membershipKey];
    const admission = (membership?.value as { admission?: string } | undefined)
      ?.admission;
    const revision = this.nextRevision(key, baselineState);
    const entries = state.entries;
    const candidate: OrbitDBCommunityReplicaRegister = {
      removed: value === undefined,
      revision,
      value: value === undefined ? null : { ...(value as object), admission },
    };
    entries[key] = entries[key]
      ? this.winner(key, entries[key], candidate)
      : candidate;
  }

  private applyChanges(
    next: OrbitDBCommunityDocument,
    baseline: OrbitDBCommunityDocument | undefined,
    state: OrbitDBCommunityReplicaState,
  ): void {
    const before = baseline
      ? this.elements(baseline)
      : new Map<string, unknown>();
    const after = this.elements(next);
    const baselineState = baseline ? this.state(baseline) : undefined;
    const changed = [...new Set([...before.keys(), ...after.keys()])].filter(
      (key) =>
        this.canonical(before.get(key)) !== this.canonical(after.get(key)),
    );
    const isAssignment = (key: string): boolean =>
      (JSON.parse(key) as string[])[0] === 'memberRoles';
    for (const key of changed.filter((key) => !isAssignment(key)))
      this.changeElement(key, after.get(key), state, baselineState);
    for (const key of changed.filter(isAssignment))
      this.changeAssignment(key, after.get(key), before, state, baselineState);
  }

  public merge(
    current: OrbitDBCommunityDocument,
    candidate: OrbitDBCommunityDocument,
  ): OrbitDBCommunityDocument {
    this.sameScope(current, candidate);

    if (!current.replicaState && !candidate.replicaState)
      return structuredClone(this.legacyWinner(current, candidate));

    if (!current.replicaState)
      return this.project(candidate, this.state(candidate));

    if (!candidate.replicaState)
      return this.project(current, this.state(current));
    const entries = this.mergedEntries(
      this.state(current),
      this.state(candidate),
    );

    return this.project(this.mergedMetadata(current, candidate), {
      entries,
      version: 1,
    });
  }

  public prepareWrite(
    next: OrbitDBCommunityDocument,
    baseline: OrbitDBCommunityDocument | undefined,
    previous: OrbitDBCommunityDocument | undefined,
    now: number,
  ): OrbitDBCommunityReplicaWrite {
    this.validateUpdate(next, baseline, previous);
    const authored = this.nextDocument(next, baseline, baseline, now);

    return {
      baseline: authored,
      document: previous ? this.merge(previous, authored) : authored,
    };
  }

  public nextDocument(
    next: OrbitDBCommunityDocument,
    baseline: OrbitDBCommunityDocument | undefined,
    previous: OrbitDBCommunityDocument | undefined,
    now: number,
  ): OrbitDBCommunityDocument {
    this.validateUpdate(next, baseline, previous);
    const source = baseline ?? next;
    const state = this.state(source);
    this.applyChanges(next, baseline, state);

    const authored = this.project(
      { ...next, updatedAt: Math.max(now, (source.updatedAt ?? 0) + 1) },
      state,
    );

    return previous ? this.merge(previous, authored) : authored;
  }

  public tombstone(
    next: OrbitDBCommunityDocument,
    previous: OrbitDBCommunityDocument | undefined,
    now: number,
  ): OrbitDBCommunityDocument {
    if (previous) this.sameScope(next, previous);

    return this.project(
      {
        ...(previous ?? next),
        deleted: true,
        deletedAt: now,
        updatedAt: Math.max(now, (previous?.updatedAt ?? 0) + 1),
      },
      this.state(previous ?? next),
    );
  }
}
