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

  Scenario: Respond to a conversation sync request through the consumer
    When the conversation sync request consumer handles a sync request
    Then the conversation sync responder should receive that request

  Scenario: Register messages announced by a conversation sync response through the consumer
    When the conversation sync available consumer handles a sync response
    Then the conversation message registrar should receive the valid sync messages

  Scenario: Mark conversation messages as read through the consumer
    When the messages read consumer handles a read announcement
    Then the messages read registrar should receive that read marker
