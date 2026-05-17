import { MongoIdentityMetadataRepository } from '@app/contexts/identities/infrastructure/mongo';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import MongoIdentityPresenceRepository from '../infrastructure/mongo/MongoIdentityPresenceRepository';
import IdentityPresenceExpirationRegistrar from './expire/IdentityPresenceExpirationRegistrar';
import IdentityPresenceFinder from './find/IdentityPresenceFinder';
import IdentityPresenceNetworkResolver from './IdentityPresenceNetworkResolver';
import IdentityPresenceHeartbeatRecorder from './record-heartbeat/IdentityPresenceHeartbeatRecorder';
import IdentityPresenceUpdater from './update/IdentityPresenceUpdater';

export class IdentityPresenceServicesFactory {
  constructor(
    private readonly mongo: MongoDB,
    private readonly metadataRepository: MongoIdentityMetadataRepository,
    private readonly eventPublisher: MessageBus,
  ) {}

  private repository(): MongoIdentityPresenceRepository {
    return new MongoIdentityPresenceRepository(this.mongo);
  }

  private networkResolver(): IdentityPresenceNetworkResolver {
    return new IdentityPresenceNetworkResolver(this.metadataRepository);
  }

  public expirationRegistrar(): IdentityPresenceExpirationRegistrar {
    return new IdentityPresenceExpirationRegistrar(
      this.repository(),
      this.networkResolver(),
      this.eventPublisher,
    );
  }

  public finder(): IdentityPresenceFinder {
    return new IdentityPresenceFinder(this.repository());
  }

  public heartbeatRecorder(): IdentityPresenceHeartbeatRecorder {
    return new IdentityPresenceHeartbeatRecorder(
      this.repository(),
      this.networkResolver(),
      this.eventPublisher,
    );
  }

  public updater(): IdentityPresenceUpdater {
    return new IdentityPresenceUpdater(
      this.repository(),
      this.networkResolver(),
      this.eventPublisher,
    );
  }
}
