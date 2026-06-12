Feature: Keychain PubSub consumers

  Scenario: Register a keychain publication through the consumer
    When the keychain published consumer handles a keychain publication
    Then the current keychain finder should receive the owner identity

  Scenario: Synchronize an updated keychain through the consumer
    When the keychain updated consumer handles a keychain publication
    Then the current keychain finder should receive the owner identity
