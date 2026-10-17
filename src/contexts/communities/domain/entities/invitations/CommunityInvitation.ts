import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import {
  CommunityInvitationConsent,
  CommunityInvitationFields,
  CommunityInvitationKey,
  CommunityInvitationPossession,
} from '@haskou/pigeon-swarm-crypto';
import { assert } from '@haskou/value-objects';

import { Community } from '../../Community';
import { CommunityInvitationUnusableError } from '../../errors/CommunityInvitationUnusableError';
import { InvalidCommunityOperationError } from '../../errors/InvalidCommunityOperationError';
import { CommunityOperation } from '../../operations/CommunityOperation';
import { CommunityOperationArgumentReader } from '../../operations/CommunityOperationArgumentReader';
import { CommunityJoinMethod } from '../../value-objects/CommunityJoinMethod';
import { CommunityOperationAction } from '../../value-objects/CommunityOperationAction';
import { CommunityPermission } from '../../value-objects/CommunityPermission';

type CommunityInvitationAttributes = {
  communityId: string;
  createdAt: number;
  expiresAt: number;
  id: string;
  invitationKey: string;
  invitee?: IdentityId;
  issuerIdentityId: IdentityId;
  maxUses: number;
  networkId: string;
};

/** What the operations of one set say about an invitation. */
type CommunityInvitationStatus = {
  /**
   * A standing cut outside the causal past of the invitation took
   * `create_invites` (or membership) from its issuer.
   */
  cut: boolean;
  /** Distinct identities with a valid admission under the invitation. */
  joinerIds: string[];
  revoked: boolean;
};

/**
 * An invitation, as its `invitation_created` operation states it, with its
 * status in one set of operations. Its id is the operation digest. Only the
 * public invitation key is known here: the secret stays in the link.
 */
export class CommunityInvitation {
  /** Most identities one invitation admits. */
  public static readonly MAX_USES = 100;

  /** Longest life of an invitation after its `createdAt`: 30 days. */
  public static readonly MAX_LIFETIME = 2_592_000_000;

  private static invitationKeyOf(value: string): string {
    try {
      return CommunityInvitationKey.parsePublicKey(value);
    } catch {
      throw new InvalidCommunityOperationError();
    }
  }

  private static inviteeOf(value: string): IdentityId {
    try {
      return new IdentityId(value);
    } catch {
      throw new InvalidCommunityOperationError();
    }
  }

  /** Whether `operation` admits a member under an invitation. */
  public static isAdmission(operation: CommunityOperation): boolean {
    return (
      operation.getAction().isEqual(CommunityOperationAction.MEMBER_JOINED) &&
      operation.getArguments().method ===
        CommunityJoinMethod.INVITATION.valueOf()
    );
  }

  /**
   * Reads an `invitation_created` operation; throws when its arguments break
   * a rule of the invitation itself, whoever authors it.
   */
  public static fromOperation(
    operation: CommunityOperation,
  ): CommunityInvitation {
    const reader = new CommunityOperationArgumentReader(
      operation.getArguments(),
      ['expiresAt', 'invitationKey', 'maxUses'],
      ['invitee'],
    );
    const maxUses = reader.integer('maxUses');
    const expiresAt = reader.integer('expiresAt');
    const invitee = reader.optionalString('invitee');
    const createdAt = operation.getCreatedAt();
    const inviteeIdentityId =
      invitee === undefined
        ? undefined
        : CommunityInvitation.inviteeOf(invitee);

    assert(
      maxUses >= 1 &&
        maxUses <= CommunityInvitation.MAX_USES &&
        (inviteeIdentityId === undefined ||
          (maxUses === 1 && inviteeIdentityId.isCanonicalKey())) &&
        expiresAt > createdAt &&
        expiresAt <= createdAt + CommunityInvitation.MAX_LIFETIME,
      new InvalidCommunityOperationError(),
    );

    return new CommunityInvitation(
      {
        communityId: operation.getCommunityId().valueOf(),
        createdAt,
        expiresAt,
        id: operation.getHash(),
        invitationKey: CommunityInvitation.invitationKeyOf(
          reader.string('invitationKey'),
        ),
        invitee: inviteeIdentityId,
        issuerIdentityId: operation.getAuthorIdentityId(),
        maxUses,
        networkId: operation.getNetworkId().valueOf(),
      },
      { cut: false, joinerIds: [], revoked: false },
    );
  }

  private constructor(
    private readonly attributes: CommunityInvitationAttributes,
    private readonly status: CommunityInvitationStatus,
  ) {}

  public getId(): string {
    return this.attributes.id;
  }

  public getIssuerIdentityId(): IdentityId {
    return this.attributes.issuerIdentityId;
  }

  public getInvitationKey(): string {
    return this.attributes.invitationKey;
  }

  public getExpiresAt(): number {
    return this.attributes.expiresAt;
  }

  public isRevoked(): boolean {
    return this.status.revoked;
  }

  public hasJoined(joiner: IdentityId): boolean {
    return this.status.joinerIds.includes(joiner.valueOf());
  }

  /** Whether `at` lies in the window `[createdAt, expiresAt]`. */
  public isOpenAt(at: number): boolean {
    return at >= this.attributes.createdAt && at <= this.attributes.expiresAt;
  }

  /**
   * Whether a new admission may use the invitation in a set of operations
   * whose folded community is `community`: not revoked, its issuer's
   * `create_invites` never cut since issuing, uses left, and the issuer
   * still holding `create_invites`.
   */
  public isLiveIn(community: Community): boolean {
    return (
      !this.status.revoked &&
      !this.status.cut &&
      this.status.joinerIds.length < this.attributes.maxUses &&
      community.holds(
        this.attributes.issuerIdentityId,
        CommunityPermission.CREATE_INVITES,
      )
    );
  }

  /** What the possession and consent proofs of `joiner` sign. */
  public fieldsFor(joiner: IdentityId): CommunityInvitationFields {
    return {
      communityId: this.attributes.communityId,
      identityId: joiner.valueOf(),
      invitationId: this.attributes.id,
      networkId: this.attributes.networkId,
    };
  }

  /**
   * Throws unless the invitation is live in `community` and lets `joiner`
   * in with these proofs: a canonical id, the `invitee` when it names one,
   * a first use by this identity, a possession proof by the invitation key
   * and the joiner's consent. The window is not checked here.
   */
  public assertAdmits(
    community: Community,
    joiner: IdentityId,
    possession: string,
    consent: string,
  ): void {
    const { invitee } = this.attributes;

    assert(
      this.isLiveIn(community) &&
        joiner.isCanonicalKey() &&
        (invitee === undefined || invitee.isEqual(joiner)) &&
        !this.hasJoined(joiner),
      new CommunityInvitationUnusableError(),
    );

    try {
      CommunityInvitationPossession.verify(
        this.fieldsFor(joiner),
        possession,
        this.attributes.invitationKey,
      );
      CommunityInvitationConsent.verify(this.fieldsFor(joiner), consent);
    } catch {
      throw new CommunityInvitationUnusableError();
    }
  }

  public withJoiner(joinerId: string): CommunityInvitation {
    return this.status.joinerIds.includes(joinerId)
      ? this
      : new CommunityInvitation(this.attributes, {
          ...this.status,
          joinerIds: [...this.status.joinerIds, joinerId],
        });
  }

  public revoked(): CommunityInvitation {
    return new CommunityInvitation(this.attributes, {
      ...this.status,
      revoked: true,
    });
  }

  public cut(): CommunityInvitation {
    return new CommunityInvitation(this.attributes, {
      ...this.status,
      cut: true,
    });
  }

  public toPrimitives(community: Community) {
    return {
      createdAt: this.attributes.createdAt,
      expiresAt: this.attributes.expiresAt,
      id: this.attributes.id,
      invitationKey: this.attributes.invitationKey,
      invitee: this.attributes.invitee?.valueOf(),
      issuerIdentityId: this.attributes.issuerIdentityId.valueOf(),
      live: this.isLiveIn(community),
      maxUses: this.attributes.maxUses,
      revoked: this.status.revoked,
      uses: this.status.joinerIds.length,
    };
  }
}
