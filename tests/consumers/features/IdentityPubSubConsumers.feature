Feature: Identity PubSub consumers

  Scenario: Synchronize an updated identity through the consumer
    When the identity updated consumer handles an identity update
    Then the identity candidate registrar should receive that publication
