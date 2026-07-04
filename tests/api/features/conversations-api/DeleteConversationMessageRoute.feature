Feature: Delete conversation messages

  Scenario: Delete an encrypted message in a one-to-one conversation
    Given I register a private IPFS network "api-conversation-delete-message-network"
    And I have created a one-to-one conversation
    And I have sent an encrypted conversation message
    And I set a delete conversation message body
    And I sign the current conversation message deletion request
    When I DELETE the sent message from the current conversation
    Then response code is equal to 200
    And response data should match partially
    """
    {
      "type": "deleted"
    }
    """
    And I sign the current latest conversation messages request
    When I GET latest messages from the current conversation
    Then response code is equal to 200
    And response body should not contain "encrypted-message-payload"
    And response body should contain "deleted"
