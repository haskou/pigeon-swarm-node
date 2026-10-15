import { NodeRegistrationCodeIssuerMessage } from '@app/contexts/nodes/application/issue-registration-code/messages/NodeRegistrationCodeIssuerMessage';
import NodeRegistrationCodeIssuer from '@app/contexts/nodes/application/issue-registration-code/NodeRegistrationCodeIssuer';
import { NodeRegistrationCodeExpiryIsOutOfRangeError } from '@app/contexts/nodes/domain/errors/NodeRegistrationCodeExpiryIsOutOfRangeError';
import { NodeRegistrationCodeMaxUsesIsOutOfRangeError } from '@app/contexts/nodes/domain/errors/NodeRegistrationCodeMaxUsesIsOutOfRangeError';
import { NodeRegistrationCodeLimits } from '@app/contexts/nodes/domain/NodeRegistrationCodeLimits';
import NodeRegistrationCodeRepository from '@app/contexts/nodes/domain/repositories/NodeRegistrationCodeRepository';
import { Timestamp } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

describe('NodeRegistrationCodeIssuer', () => {
  let repository: MockProxy<NodeRegistrationCodeRepository>;
  let issuer: NodeRegistrationCodeIssuer;

  beforeEach(() => {
    repository = mock<NodeRegistrationCodeRepository>();
    issuer = new NodeRegistrationCodeIssuer(
      repository,
      new NodeRegistrationCodeLimits(5, 2),
    );
  });

  it('should issue a single-use code by default and store only its hash', async () => {
    const expiresAt = Timestamp.now().addDays(1).valueOf();

    const issued = await issuer.issue(
      new NodeRegistrationCodeIssuerMessage(expiresAt),
    );
    const primitives = issued.code.toPrimitives();

    expect(primitives).toEqual(
      expect.objectContaining({ expiresAt, maxUses: 1, usesLeft: 1 }),
    );
    expect(primitives.hash).toBe(issued.secret.hash().valueOf());
    expect(repository.save).toHaveBeenCalledWith(issued.code);
  });

  it('should refuse more uses than the configured maximum', async () => {
    await expect(
      issuer.issue(
        new NodeRegistrationCodeIssuerMessage(
          Timestamp.now().addDays(1).valueOf(),
          6,
        ),
      ),
    ).rejects.toThrow(NodeRegistrationCodeMaxUsesIsOutOfRangeError);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('should refuse a lifetime above the configured maximum', async () => {
    await expect(
      issuer.issue(
        new NodeRegistrationCodeIssuerMessage(
          Timestamp.now().addDays(3).valueOf(),
        ),
      ),
    ).rejects.toThrow(NodeRegistrationCodeExpiryIsOutOfRangeError);
  });
});
