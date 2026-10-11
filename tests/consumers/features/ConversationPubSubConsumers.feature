Feature: Conversation PubSub consumers

  Scenario: Register a sent conversation message through the consumer
    When the message sent consumer handles a message announcement
    Then the conversation message registrar should receive that message

  Scenario: Register an edited conversation message through the consumer
    When the message edited consumer handles a message announcement
    Then the conversation message registrar should receive that message

  Scenario: Register a deleted conversation message through the consumer
    When the message deleted consumer handles a message announcement
    Then the conversation message registrar should receive that message

  Scenario: Register an added message reaction through the consumer
    When the message reaction added consumer handles a reaction announcement
    Then the conversation message reaction registrar should receive that reaction

  Scenario: Register a removed message reaction through the consumer
    When the message reaction removed consumer handles a reaction announcement
    Then the conversation message reaction registrar should remove that reaction
  Scenario: Mark conversation messages as read through the consumer
    When the messages read consumer handles a read announcement
    Then the messages read registrar should receive that read marker

  Scenario: Ignore a read announcement without the reader's signature through the consumer
    When the messages read consumer handles an unsigned read announcement
    Then the messages read registrar should receive no read marker

  Scenario: Clear push notifications for a signed read announcement through the consumer
    When the push clear consumer handles a read announcement
    Then the push notification dispatcher should receive that read announcement

  Scenario: Ignore a read announcement without the reader's signature for push clearing
    When the push clear consumer handles an unsigned read announcement
    Then the push notification dispatcher should receive no read announcement
