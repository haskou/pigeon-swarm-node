import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { AggregateRoot } from '@haskou/ddd-kernel/domain';
import { assert, PrimitiveOf } from '@haskou/value-objects';

import { CommunityRequestActorMismatchError } from '../../errors/CommunityRequestActorMismatchError';
import { CommunityRequestAlreadyResolvedError } from '../../errors/CommunityRequestAlreadyResolvedError';
import { CommunityMembershipRequestWasAcceptedEvent } from '../../events/CommunityMembershipRequestWasAcceptedEvent';
import { CommunityMembershipRequestWasCreatedEvent } from '../../events/CommunityMembershipRequestWasCreatedEvent';
import { CommunityMembershipRequestWasDeclinedEvent } from '../../events/CommunityMembershipRequestWasDeclinedEvent';
import { CommunityId } from '../../value-objects/CommunityId';
import { CommunityRequestId } from '../../value-objects/CommunityRequestId';
import { CommunityRequestStatus } from '../../value-objects/CommunityRequestStatus';
import { CommunityRequestType } from '../../value-objects/CommunityRequestType';
import { CommunityMembershipRequestTimestamps } from './CommunityMembershipRequestTimestamps';

export class CommunityMembershipRequest extends AggregateRoot {
  public static invitation(
    communityId: CommunityId,
    creatorIdentityId: IdentityId,
    identityId: IdentityId,
    ownerIdentityId: IdentityId = creatorIdentityId,
  ): CommunityMembershipRequest {
    const request = new CommunityMembershipRequest(
      CommunityRequestId.generate(),
      communityId,
      CommunityRequestType.INVITATION,
      CommunityRequestStatus.PENDING,
      creatorIdentityId,
      identityId,
      CommunityMembershipRequestTimestamps.now(),
    );

    request.recordCreated(ownerIdentityId);

    return request;
  }

  public static request(
    communityId: CommunityId,
    requesterIdentityId: IdentityId,
    ownerIdentityId?: IdentityId,
  ): CommunityMembershipRequest {
    const request = new CommunityMembershipRequest(
      CommunityRequestId.generate(),
      communityId,
      CommunityRequestType.REQUEST,
      CommunityRequestStatus.PENDING,
      requesterIdentityId,
      requesterIdentityId,
      CommunityMembershipRequestTimestamps.now(),
    );

    request.recordCreated(ownerIdentityId);

    return request;
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<CommunityMembershipRequest>,
  ): CommunityMembershipRequest {
    return new CommunityMembershipRequest(
      new CommunityRequestId(primitives.id),
      new CommunityId(primitives.communityId),
      new CommunityRequestType(primitives.type),
      new CommunityRequestStatus(primitives.status),
      new IdentityId(primitives.creatorIdentityId),
      new IdentityId(primitives.identityId),
      CommunityMembershipRequestTimestamps.fromPrimitives({
        createdAt: primitives.createdAt,
        updatedAt: primitives.updatedAt,
      }),
    );
  }

  constructor(
    private readonly id: CommunityRequestId,
    private readonly communityId: CommunityId,
    private readonly type: CommunityRequestType,
    private status: CommunityRequestStatus,
    private readonly creatorIdentityId: IdentityId,
    private readonly identityId: IdentityId,
    private timestamps: CommunityMembershipRequestTimestamps,
  ) {
    super();
  }

  private assertPending(): void {
    assert(this.status.isPending(), new CommunityRequestAlreadyResolvedError());
  }

  private assertCanAccept(
    actorIdentityId: IdentityId,
    ownerIdentityId: IdentityId,
  ): void {
    const canAcceptInvitation =
      this.type.isInvitation() && this.identityId.isEqual(actorIdentityId);
    const canAcceptRequest =
      this.type.isRequest() && ownerIdentityId.isEqual(actorIdentityId);

    assert(
      canAcceptInvitation || canAcceptRequest,
      new CommunityRequestActorMismatchError(),
    );
  }

  private assertCanDecline(
    actorIdentityId: IdentityId,
    ownerIdentityId: IdentityId,
  ): void {
    const canDeclineInvitation =
      this.type.isInvitation() &&
      (this.identityId.isEqual(actorIdentityId) ||
        this.creatorIdentityId.isEqual(actorIdentityId));
    const canDeclineRequest =
      this.type.isRequest() &&
      (this.identityId.isEqual(actorIdentityId) ||
        ownerIdentityId.isEqual(actorIdentityId));

    assert(
      canDeclineInvitation || canDeclineRequest,
      new CommunityRequestActorMismatchError(),
    );
  }

  private eventAttributes(ownerIdentityId?: IdentityId) {
    return {
      communityId: this.communityId.valueOf(),
      creatorIdentityId: this.creatorIdentityId.valueOf(),
      identityId: this.identityId.valueOf(),
      ownerIdentityId: ownerIdentityId?.valueOf(),
      request: this.toPrimitives(),
      requesterIdentityId: this.identityId.valueOf(),
      requestId: this.id.valueOf(),
      type: this.type.valueOf(),
    };
  }

  private recordCreated(ownerIdentityId?: IdentityId): void {
    this.record(
      new CommunityMembershipRequestWasCreatedEvent(
        this.communityId.valueOf(),
        this.eventAttributes(ownerIdentityId),
      ),
    );
  }

  public accept(
    actorIdentityId: IdentityId,
    ownerIdentityId: IdentityId,
  ): void {
    this.assertPending();
    this.assertCanAccept(actorIdentityId, ownerIdentityId);
    this.status = CommunityRequestStatus.ACCEPTED;
    this.timestamps = this.timestamps.touch();
    this.record(
      new CommunityMembershipRequestWasAcceptedEvent(
        this.communityId.valueOf(),
        this.eventAttributes(ownerIdentityId),
      ),
    );
  }

  public acceptAutomatically(ownerIdentityId: IdentityId): void {
    this.assertPending();
    this.status = CommunityRequestStatus.ACCEPTED;
    this.timestamps = this.timestamps.touch();
    this.record(
      new CommunityMembershipRequestWasAcceptedEvent(
        this.communityId.valueOf(),
        this.eventAttributes(ownerIdentityId),
      ),
    );
  }

  public decline(
    actorIdentityId: IdentityId,
    ownerIdentityId: IdentityId,
  ): void {
    this.assertPending();
    this.assertCanDecline(actorIdentityId, ownerIdentityId);
    this.status = CommunityRequestStatus.DECLINED;
    this.timestamps = this.timestamps.touch();
    this.record(
      new CommunityMembershipRequestWasDeclinedEvent(
        this.communityId.valueOf(),
        this.eventAttributes(ownerIdentityId),
      ),
    );
  }

  public getCommunityId(): CommunityId {
    return this.communityId;
  }

  public getId(): CommunityRequestId {
    return this.id;
  }

  public getIdentityId(): IdentityId {
    return this.identityId;
  }

  public isPending(): boolean {
    return this.status.isPending();
  }

  public isAccepted(): boolean {
    return this.status.isAccepted();
  }

  public isInvitation(): boolean {
    return this.type.isInvitation();
  }

  public isRequest(): boolean {
    return this.type.isRequest();
  }

  public toPrimitives() {
    const timestamps = this.timestamps.toPrimitives();

    return {
      communityId: this.communityId.valueOf(),
      createdAt: timestamps.createdAt,
      creatorIdentityId: this.creatorIdentityId.valueOf(),
      id: this.id.valueOf(),
      identityId: this.identityId.valueOf(),
      status: this.status.valueOf(),
      type: this.type.valueOf(),
      updatedAt: timestamps.updatedAt,
    };
  }
}
