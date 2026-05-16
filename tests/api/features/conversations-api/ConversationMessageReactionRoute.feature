Feature: React to conversation messages

  Scenario: Add and list a message reaction
    Given I register an in-memory IPFS network "api-conversation-message-reaction-network"
    And I have created a one-to-one conversation
    And I have sent an encrypted conversation message
    And I set a conversation message reaction body
    And I sign the current conversation message reaction request
    When I POST the reaction to the sent message
    Then response code is equal to 200
    And response data should match partially
    """
    {
      "emoji": "👍"
    }
    """
    And I sign the current latest conversation messages request
    When I GET latest messages from the current conversation
    Then response code is equal to 200
    And response body should contain "reactions"
    And response body should contain "👍"

  Scenario: Remove a message reaction
    Given I register an in-memory IPFS network "api-conversation-message-reaction-removal-network"
    And I have created a one-to-one conversation
    And I have sent an encrypted conversation message
    And I set a conversation message reaction body
    And I sign the current conversation message reaction request
    And I have reacted to the sent message
    And I sign the current conversation message reaction removal request
    When I DELETE the reaction from the sent message
    Then response code is equal to 200
    And I sign the current latest conversation messages request
    When I GET latest messages from the current conversation
    Then response code is equal to 200
    And response body should not contain "👍"
