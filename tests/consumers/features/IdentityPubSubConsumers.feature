Feature: Identity PubSub consumers

  Scenario: Synchronize an updated identity through the consumer
    When the identity updated consumer handles an identity update
    Then the published identity registrar should receive that identity

  Scenario: Respond to an identity sync request through the consumer
    When the identity sync request consumer handles a sync request
    Then the identity sync responder should receive that request

  Scenario: Register an identity announced by a sync response through the consumer
    When the identity sync available consumer handles a sync response
    Then the identity candidate registrar should receive the external identifier
