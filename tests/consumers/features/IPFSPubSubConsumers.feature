Feature: IPFS PubSub consumers

  Scenario: Register an IPFS content replica claim through the consumer
    When the IPFS content replica claimed consumer handles a replica claim
    Then the IPFS content replica claim registrar should receive that claim
