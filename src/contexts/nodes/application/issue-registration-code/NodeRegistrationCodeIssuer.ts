import { Timestamp } from '@haskou/value-objects';

import { NodeRegistrationCode } from '../../domain/NodeRegistrationCode';
import { NodeRegistrationCodeLimits } from '../../domain/NodeRegistrationCodeLimits';
import NodeRegistrationCodeRepository from '../../domain/repositories/NodeRegistrationCodeRepository';
import { NodeRegistrationCodeSecret } from '../../domain/value-objects/NodeRegistrationCodeSecret';
import { IssuedNodeRegistrationCode } from './IssuedNodeRegistrationCode';
import { NodeRegistrationCodeIssuerMessage } from './messages/NodeRegistrationCodeIssuerMessage';

export default class NodeRegistrationCodeIssuer {
  constructor(
    private readonly repository: NodeRegistrationCodeRepository,
    private readonly limits: NodeRegistrationCodeLimits,
  ) {}

  public async issue(
    message: NodeRegistrationCodeIssuerMessage,
  ): Promise<IssuedNodeRegistrationCode> {
    const secret = NodeRegistrationCodeSecret.generate();
    const code = NodeRegistrationCode.issue(
      secret,
      message.maxUses,
      message.expiresAt,
      this.limits,
      Timestamp.now(),
    );

    await this.repository.save(code);

    return new IssuedNodeRegistrationCode(code, secret);
  }
}
