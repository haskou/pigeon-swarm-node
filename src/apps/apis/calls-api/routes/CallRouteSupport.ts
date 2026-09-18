import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import CallAccessAuthorizer from '@app/contexts/calls/application/authorize-call/CallAccessAuthorizer';
import CallParticipantLeaseFinder from '@app/contexts/calls/application/find-participant-leases/CallParticipantLeaseFinder';
import { CallParticipantLeasesFindMessage } from '@app/contexts/calls/application/find-participant-leases/messages/CallParticipantLeasesFindMessage';
import { Call } from '@app/contexts/calls/domain/Call';
import { CallParticipantLease } from '@app/contexts/calls/domain/CallParticipantLease';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { Request } from 'express';

import { CallResource } from '../resources/CallResource';
import { CallViewModel } from '../view-model/CallViewModel';

export abstract class CallRouteSupport extends Route {
  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private readonly participantLeaseFinder =
    this.get<CallParticipantLeaseFinder>(CallParticipantLeaseFinder);

  private readonly callAccess =
    this.get<CallAccessAuthorizer>(CallAccessAuthorizer);

  protected async presentCall(call: Call): Promise<CallResource> {
    const leases = await this.findParticipantLeases([call]);
    const participants = await this.callAccess.authorizedParticipants(call);

    return new CallViewModel(call, leases, participants).toResource();
  }

  protected authenticate(request: Request): IdentityId {
    return this.signedRequestAuthenticator.authenticate(request);
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
