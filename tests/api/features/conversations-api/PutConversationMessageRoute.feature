Feature: Edit conversation messages

  Scenario: Edit an encrypted message in a one-to-one conversation
    Given I register a test IPFS network "api-conversation-edit-message-network"
    And I have created a one-to-one conversation
    And I have sent an encrypted conversation message
    And I set an edit conversation message body
    And I sign the current conversation message edition request
    When I PUT the sent message in the current conversation
    Then response code is equal to 200
    And response data should match partially
    """
    {
      "type": "edited",
      "encryptedPayload": "edited-message-payload"
    }
    """
    And response body should contain "targetMessageId"
    And I sign the current latest conversation messages request
    When I GET latest messages from the current conversation
    Then response code is equal to 200
    And response body should contain "edited-message-payload"
    And response body should contain "edited"
