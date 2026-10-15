import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import CallAccessAuthorizer from '@app/contexts/calls/application/authorize-call/CallAccessAuthorizer';
import CallParticipantLeaseFinder from '@app/contexts/calls/application/find-participant-leases/CallParticipantLeaseFinder';
import { CallParticipantLeasesFindMessage } from '@app/contexts/calls/application/find-participant-leases/messages/CallParticipantLeasesFindMessage';
import { Call } from '@app/contexts/calls/domain/Call';
import { CallNotFoundError } from '@app/contexts/calls/domain/errors/CallNotFoundError';
import { CallParticipantLease } from '@app/contexts/calls/domain/CallParticipantLease';
import CallParticipantLeaseWarmUp from '@app/contexts/calls/infrastructure/memory/CallParticipantLeaseWarmUp';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { Request } from 'express';

import CallRecordRateLimiter from '../CallRecordRateLimiter';
import { CallResource } from '../resources/CallResource';
import { CallViewModel } from '../view-model/CallViewModel';

export abstract class CallRouteSupport extends Route {
  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private readonly participantLeaseFinder =
    this.get<CallParticipantLeaseFinder>(CallParticipantLeaseFinder);

  private readonly recordRateLimiter = this.get<CallRecordRateLimiter>(
    CallRecordRateLimiter,
  );

  private readonly callAccess =
    this.get<CallAccessAuthorizer>(CallAccessAuthorizer);

  private readonly leaseWarmUp = this.get<CallParticipantLeaseWarmUp>(
    CallParticipantLeaseWarmUp,
  );

  protected async presentCall(call: Call): Promise<CallResource> {
    const leases = await this.findParticipantLeases([call]);
    const participants = await this.callAccess.authorizedParticipants(call);

    return new CallViewModel(
      call,
      leases,
      participants,
      this.leaseWarmUp.isWarmingUp(),
    ).toResource();
  }

  /**
   * Charges one signed record to the author's budget. Handed to a use case, it
   * runs only once the call accepts the record, right before it is stored: a
   * refused or not yet answerable request stores nothing and costs nothing.
   */
  protected chargeRecordTo(identityId: IdentityId): () => Promise<void> {
    return () => this.recordRateLimiter.consume(identityId);
  }

  protected authenticate(request: Request): IdentityId {
    return this.signedRequestAuthenticator.authenticate(request);
  }

  /**
   * The MLS-derived capability of a group-capability call, sent as a bearer
   * token; absent for every other call. A malformed one is refused like a
   * wrong one, so a probe learns nothing about the call.
   */
  protected capability(request: Request): string | undefined {
    const header = request.header('authorization');

    if (header === undefined) return undefined;

    const match = /^Bearer ([A-Za-z0-9_-]{20,128})$/.exec(header);

    if (!match) throw new CallNotFoundError();

    return match[1];
  }

  protected findParticipantLeases(
    calls: Call[],
  ): Promise<CallParticipantLease[]> {
    return this.participantLeaseFinder.find(
      new CallParticipantLeasesFindMessage(
        calls.map((call) => call.getId().valueOf()),
      ),
    );
  }
}
