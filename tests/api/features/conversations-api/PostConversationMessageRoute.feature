Feature: Send conversation messages

  Scenario: Send and list encrypted messages in a one-to-one conversation
    Given I register an in-memory IPFS network "api-conversation-message-network"
    And I have created a one-to-one conversation
    And I set an encrypted conversation message body
    And I sign the current conversation message request
    When I POST the message to the current conversation
    Then response code is equal to 200
    And response body should contain "encrypted-message-payload"
    And I sign the current latest conversation messages request
    When I GET latest messages from the current conversation
    Then response code is equal to 200
    And response body should contain "encrypted-message-payload"

  Scenario: Reject a message with an invalid signature
    Given I register an in-memory IPFS network "api-conversation-invalid-message-signature-network"
    And I have created a one-to-one conversation
    And I set an invalid encrypted conversation message body
    And I sign the current conversation message request
    When I POST the message to the current conversation
    Then response code is equal to 409
    And response body should contain "Message signature is not valid"

  Scenario: Send a reply to an existing message
    Given I register an in-memory IPFS network "api-conversation-reply-network"
    And I have created a one-to-one conversation
    And I have sent an encrypted conversation message
    And I set an encrypted conversation reply body
    And I sign the current conversation message request
    When I POST the message to the current conversation
    Then response code is equal to 200
    And response body should contain "encrypted-reply-payload"
    And response body should contain "replyToMessageId"
    And I sign the current latest conversation messages request
    When I GET latest messages from the current conversation
    Then response code is equal to 200
    And response body should contain "replyToMessageId"

  Scenario: Page messages before a known message
    Given I register an in-memory IPFS network "api-conversation-pagination-network"
    And I have created a one-to-one conversation
    And I have sent an encrypted conversation message
    And I sign the current latest conversation messages request
    When I GET latest messages before the sent message
    Then response code is equal to 200
    And response data should match partially
    """
    {
      "messages": []
    }
    """
