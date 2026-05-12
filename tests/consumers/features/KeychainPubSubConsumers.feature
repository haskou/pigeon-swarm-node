Feature: Keychain PubSub consumers

  Scenario: Register a keychain publication through the consumer
    When the keychain published consumer handles a keychain publication
    Then the current keychain finder should receive the owner identity

  Scenario: Synchronize an updated keychain through the consumer
    When the keychain updated consumer handles a keychain publication
    Then the current keychain finder should receive the owner identity

  Scenario: Respond to a keychain sync request through the consumer
    When the keychain sync request consumer handles a sync request
    Then the keychain sync responder should receive that request

  Scenario: Register a keychain announced by a sync response through the consumer
    When the keychain sync available consumer handles a sync response
    Then the keychain candidate registrar should receive the external identifier
