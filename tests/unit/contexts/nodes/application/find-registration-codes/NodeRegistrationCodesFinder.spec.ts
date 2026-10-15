import NodeRegistrationCodesFinder from '@app/contexts/nodes/application/find-registration-codes/NodeRegistrationCodesFinder';
import { NodeRegistrationCode } from '@app/contexts/nodes/domain/NodeRegistrationCode';
import NodeRegistrationCodeRepository from '@app/contexts/nodes/domain/repositories/NodeRegistrationCodeRepository';
import { NodeRegistrationCodeId } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationCodeId';
import { NodeRegistrationCodeSecret } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationCodeSecret';
import { Timestamp } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

describe('NodeRegistrationCodesFinder', () => {
  let repository: MockProxy<NodeRegistrationCodeRepository>;
  let finder: NodeRegistrationCodesFinder;

  const code = (usesLeft: number, expiresAt: Timestamp): NodeRegistrationCode =>
    NodeRegistrationCode.fromPrimitives({
      expiresAt: expiresAt.valueOf(),
      hash: NodeRegistrationCodeSecret.generate().hash().valueOf(),
      id: NodeRegistrationCodeId.generate().valueOf(),
      maxUses: 2,
      usesLeft,
    });

  beforeEach(() => {
    repository = mock<NodeRegistrationCodeRepository>();
    finder = new NodeRegistrationCodesFinder(repository);
  });

  it('should list usable codes and drop expired and used-up ones', async () => {
    const usable = code(1, Timestamp.now().addDays(1));
    const usedUp = code(0, Timestamp.now().addDays(1));
    const expired = code(2, new Timestamp(Timestamp.now().valueOf() - 1));

    repository.findAll.mockResolvedValue([usable, usedUp, expired]);

    await expect(finder.find()).resolves.toEqual([usable]);
    expect(repository.remove).toHaveBeenCalledTimes(2);
    expect(repository.remove).toHaveBeenCalledWith(usedUp.getId());
    expect(repository.remove).toHaveBeenCalledWith(expired.getId());
  });
});
