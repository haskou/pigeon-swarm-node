Feature: Keychain PubSub consumers

  Scenario: Register a keychain publication through the consumer
    When the keychain published consumer handles a keychain publication
    Then the current keychain finder should receive the owner identity

  Scenario: Synchronize an updated keychain through the consumer
    When the keychain updated consumer handles a keychain publication
    Then the current keychain finder should receive the owner identity

  Scenario: Keychain publication before its keychain is resolvable completes the register consumer
    When the keychain published consumer handles a publication whose keychain is not resolvable yet
    Then the consumer handler should complete without a failure

  Scenario: Keychain publication before its keychain is resolvable completes the synchronize consumer
    When the keychain updated consumer handles a publication whose keychain is not resolvable yet
    Then the consumer handler should complete without a failure

  Scenario: Unexpected lookup failure fails the register consumer
    When the keychain published consumer handles a publication whose lookup fails unexpectedly
    Then the consumer handler should fail with the lookup error
