import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { CommunityChannelPollScopeAuthorizeMessage } from '@app/contexts/polls/application/authorize-poll-scope/messages/CommunityChannelPollScopeAuthorizeMessage';
import { GroupConversationPollScopeAuthorizeMessage } from '@app/contexts/polls/application/authorize-poll-scope/messages/GroupConversationPollScopeAuthorizeMessage';
import PollScopeAuthorizer from '@app/contexts/polls/application/authorize-poll-scope/PollScopeAuthorizer';
import { PollScopeResolution } from '@app/contexts/polls/application/authorize-poll-scope/PollScopeResolution';
import { PollFindMessage } from '@app/contexts/polls/application/find/messages/PollFindMessage';
import PollFinder from '@app/contexts/polls/application/find/PollFinder';
import { Poll } from '@app/contexts/polls/domain/Poll';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { Request } from 'express';

export abstract class PollRouteSupport extends Route {
  protected readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private readonly finder = this.get<PollFinder>(PollFinder);

  private readonly scopeAuthorizer =
    this.get<PollScopeAuthorizer>(PollScopeAuthorizer);

  protected authenticate(request: Request): IdentityId {
    return this.signedRequestAuthenticator.authenticate(request);
  }

  protected async findPoll(id: string): Promise<Poll> {
    return this.finder.find(new PollFindMessage(id));
  }

  protected async communityChannelScope(
    actor: IdentityId,
    communityId: string,
    channelId: string,
  ): Promise<PollScopeResolution> {
    return this.scopeAuthorizer.authorizeCommunityChannelCreation(
      new CommunityChannelPollScopeAuthorizeMessage(
        actor.valueOf(),
        communityId,
        channelId,
      ),
    );
  }

  protected async communityChannelVoteScope(
    actor: IdentityId,
    communityId: string,
    channelId: string,
  ): Promise<PollScopeResolution> {
    return this.scopeAuthorizer.authorizeCommunityChannelVote(
      new CommunityChannelPollScopeAuthorizeMessage(
        actor.valueOf(),
        communityId,
        channelId,
      ),
    );
  }

  protected async groupConversationScope(
    actor: IdentityId,
    conversationId: string,
  ): Promise<PollScopeResolution> {
    return this.scopeAuthorizer.authorizeGroupConversation(
      new GroupConversationPollScopeAuthorizeMessage(
        actor.valueOf(),
        conversationId,
      ),
    );
  }

  protected async accessPollScope(
    actor: IdentityId,
    poll: Poll,
  ): Promise<PollScopeResolution> {
    return this.scopeAuthorizer.authorizePollVote(actor, poll);
  }

  protected async managePollScope(
    actor: IdentityId,
    poll: Poll,
  ): Promise<PollScopeResolution> {
    return this.scopeAuthorizer.authorizePollManagement(actor, poll);
  }
}
