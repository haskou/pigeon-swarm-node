import { assert } from '@haskou/value-objects';

import { InvalidConversationOperationError } from '../errors/InvalidConversationOperationError';
import { ConversationOperationLimits } from './ConversationOperationLimits';

export type ConversationRosterPrimitives = {
  admins: string[];
  creator: string;
  id: string;
  members: string[];
  name?: string;
  networkId: string;
  type: 'group' | 'one-to-one';
};

/**
 * Who belongs to a conversation and with which role: the state that the signed
 * operations of a conversation fold into. The creator is always a member and
 * never an admin (the creator is above the admins); a 1:1 roster never changes.
 *
 * Every mutator throws `InvalidConversationOperationError` when the acting
 * identity is not permitted, so the same rules admit an operation and fold it.
 */
export class ConversationRoster {
  public static fromPrimitives(
    primitives: ConversationRosterPrimitives,
  ): ConversationRoster {
    return new ConversationRoster(
      primitives.id,
      primitives.networkId,
      primitives.type,
      primitives.creator,
      [...primitives.members],
      [...primitives.admins],
      primitives.name,
    );
  }

  constructor(
    private readonly id: string,
    private readonly networkId: string,
    private readonly type: 'group' | 'one-to-one',
    private readonly creator: string,
    private readonly members: string[],
    private readonly admins: string[] = [],
    private readonly name?: string,
  ) {}

  private assertCanManage(actor: string): void {
    assert(
      this.isGroup() && (this.creator === actor || this.admins.includes(actor)),
      new InvalidConversationOperationError(),
    );
  }

  private assertCreator(actor: string): void {
    assert(
      this.isGroup() && this.creator === actor,
      new InvalidConversationOperationError(),
    );
  }

  private assertMember(identityId: string): void {
    assert(
      this.members.includes(identityId),
      new InvalidConversationOperationError(),
    );
  }

  private drop(list: string[], identityId: string): void {
    const index = list.indexOf(identityId);

    if (index >= 0) list.splice(index, 1);
  }

  public addMember(actor: string, identityId: string): void {
    this.assertCanManage(actor);
    assert(
      !this.members.includes(identityId) &&
        this.members.length <
          ConversationOperationLimits.MAX_GROUP_PARTICIPANTS,
      new InvalidConversationOperationError(),
    );
    this.members.push(identityId);
    this.members.sort();
  }

  public demoteAdmin(actor: string, identityId: string): void {
    this.assertCreator(actor);
    assert(
      this.admins.includes(identityId),
      new InvalidConversationOperationError(),
    );
    this.drop(this.admins, identityId);
  }

  public getAdmins(): string[] {
    return [...this.admins];
  }

  public getCreator(): string {
    return this.creator;
  }

  public getId(): string {
    return this.id;
  }

  public getMembers(): string[] {
    return [...this.members];
  }

  public getName(): string | undefined {
    return this.name;
  }

  public getNetworkId(): string {
    return this.networkId;
  }

  public isAdmin(identityId: string): boolean {
    return this.admins.includes(identityId);
  }

  public isGroup(): boolean {
    return this.type === 'group';
  }

  public isMember(identityId: string): boolean {
    return this.members.includes(identityId);
  }

  public leave(actor: string): void {
    assert(
      this.isGroup() && this.creator !== actor,
      new InvalidConversationOperationError(),
    );
    this.assertMember(actor);
    this.drop(this.members, actor);
    this.drop(this.admins, actor);
  }

  public promoteAdmin(actor: string, identityId: string): void {
    this.assertCreator(actor);
    this.assertMember(identityId);
    assert(
      this.creator !== identityId && !this.admins.includes(identityId),
      new InvalidConversationOperationError(),
    );
    this.admins.push(identityId);
    this.admins.sort();
  }

  /**
   * Admins remove plain members; only the creator removes an admin. The
   * creator can never be removed, and nobody removes themselves (they leave).
   */
  public removeMember(actor: string, identityId: string): void {
    this.assertCanManage(actor);
    this.assertMember(identityId);
    assert(
      identityId !== this.creator &&
        identityId !== actor &&
        (!this.admins.includes(identityId) || this.creator === actor),
      new InvalidConversationOperationError(),
    );
    this.drop(this.members, identityId);
    this.drop(this.admins, identityId);
  }

  public toPrimitives(): ConversationRosterPrimitives {
    return {
      admins: [...this.admins],
      creator: this.creator,
      id: this.id,
      members: [...this.members],
      ...(this.name === undefined ? {} : { name: this.name }),
      networkId: this.networkId,
      type: this.type,
    };
  }
}
