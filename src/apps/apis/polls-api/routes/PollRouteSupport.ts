import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { PollFindMessage } from '@app/contexts/polls/application/find/messages/PollFindMessage';
import PollFinder from '@app/contexts/polls/application/find/PollFinder';
import { CommunityChannelPollScopeResolveMessage } from '@app/contexts/polls/application/resolve-scope/messages/CommunityChannelPollScopeResolveMessage';
import { GroupConversationPollScopeResolveMessage } from '@app/contexts/polls/application/resolve-scope/messages/GroupConversationPollScopeResolveMessage';
import PollScopeAccessResolver from '@app/contexts/polls/application/resolve-scope/PollScopeAccessResolver';
import { PollScopeAccess } from '@app/contexts/polls/application/resolve-scope/types/PollScopeAccess';
import { Poll } from '@app/contexts/polls/domain/Poll';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request } from 'express';

export abstract class PollRouteSupport extends Route {
  protected readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private readonly finder = this.get<PollFinder>(PollFinder);

  private readonly scopeResolver = this.get<PollScopeAccessResolver>(
    PollScopeAccessResolver,
  );

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
  ): Promise<PollScopeAccess> {
    return this.scopeResolver.resolveCommunityChannelCreation(
      new CommunityChannelPollScopeResolveMessage(
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
  ): Promise<PollScopeAccess> {
    return this.scopeResolver.resolveCommunityChannelVote(
      new CommunityChannelPollScopeResolveMessage(
        actor.valueOf(),
        communityId,
        channelId,
      ),
    );
  }

  protected async groupConversationScope(
    actor: IdentityId,
    conversationId: string,
  ): Promise<PollScopeAccess> {
    return this.scopeResolver.resolveGroupConversation(
      new GroupConversationPollScopeResolveMessage(
        actor.valueOf(),
        conversationId,
      ),
    );
  }

  protected async accessPollScope(
    actor: IdentityId,
    poll: Poll,
  ): Promise<PollScopeAccess> {
    return this.scopeResolver.resolvePollVote(actor, poll);
  }

  protected async managePollScope(
    actor: IdentityId,
    poll: Poll,
  ): Promise<PollScopeAccess> {
    return this.scopeResolver.resolvePollManagement(actor, poll);
  }
}
