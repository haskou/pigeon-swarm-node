Feature: Reject the replicated message log for one-to-one conversations
  One-to-one messages travel only through opaque mailboxes.
  The replicated conversation message routes serve groups only.

  Scenario: Sending a one-to-one message is rejected
    Given I register a test IPFS network "api-one-to-one-send-rejected-network"
    And I have created a one-to-one conversation
    And I set an encrypted conversation message body
    And I sign the current conversation message request
    When I POST the message to the current conversation
    Then response code is equal to 409
    And response data should match partially
    """
    {
      "code": "OneToOneConversationMessagesNotReplicatedError"
    }
    """

  Scenario: Listing one-to-one messages is rejected
    Given I register a test IPFS network "api-one-to-one-list-rejected-network"
    And I have created a one-to-one conversation
    And I sign the current latest conversation messages request
    When I GET latest messages from the current conversation
    Then response code is equal to 409
    And response data should match partially
    """
    {
      "code": "OneToOneConversationMessagesNotReplicatedError"
    }
    """

  Scenario Outline: Reading one-to-one messages by id is rejected
    Given I register a test IPFS network "<network>"
    And I have created a one-to-one conversation
    And I target an unknown conversation message
    And I sign a GET request to the current conversation message path "<path>"
    When I send the signed conversation request
    Then response code is equal to 409
    And response data should match partially
    """
    {
      "code": "OneToOneConversationMessagesNotReplicatedError"
    }
    """

    Examples:
      | network                                | path                        |
      | api-one-to-one-message-rejected-network | /messages/{message}         |
      | api-one-to-one-around-rejected-network  | /messages/{message}/around  |
      | api-one-to-one-thread-rejected-network  | /messages/{message}/thread  |
      | api-one-to-one-pins-rejected-network    | /pins                       |

  Scenario: Editing a one-to-one message is rejected
    Given I register a test IPFS network "api-one-to-one-edit-rejected-network"
    And I have created a one-to-one conversation
    And I target an unknown conversation message
    And I set an edit conversation message body
    And I sign the current conversation message edition request
    When I PUT the sent message in the current conversation
    Then response code is equal to 409
    And response data should match partially
    """
    {
      "code": "OneToOneConversationMessagesNotReplicatedError"
    }
    """

  Scenario: Deleting a one-to-one message is rejected
    Given I register a test IPFS network "api-one-to-one-delete-rejected-network"
    And I have created a one-to-one conversation
    And I target an unknown conversation message
    And I set a delete conversation message body
    And I sign the current conversation message deletion request
    When I DELETE the sent message from the current conversation
    Then response code is equal to 409
    And response data should match partially
    """
    {
      "code": "OneToOneConversationMessagesNotReplicatedError"
    }
    """

  Scenario: Reacting to a one-to-one message is rejected
    Given I register a test IPFS network "api-one-to-one-reaction-rejected-network"
    And I have created a one-to-one conversation
    And I target an unknown conversation message
    And I set a conversation message reaction body
    And I sign the current conversation message reaction request
    When I POST the reaction to the sent message
    Then response code is equal to 409
    And response data should match partially
    """
    {
      "code": "OneToOneConversationMessagesNotReplicatedError"
    }
    """

  Scenario: Removing a one-to-one reaction is rejected
    Given I register a test IPFS network "api-one-to-one-reaction-removal-rejected-network"
    And I have created a one-to-one conversation
    And I target an unknown conversation message
    And I sign the current conversation message reaction removal request
    When I DELETE the reaction from the sent message
    Then response code is equal to 409
    And response data should match partially
    """
    {
      "code": "OneToOneConversationMessagesNotReplicatedError"
    }
    """

  Scenario: Pinning a one-to-one message is rejected
    Given I register a test IPFS network "api-one-to-one-pin-rejected-network"
    And I have created a one-to-one conversation
    And I target an unknown conversation message
    And I set a conversation message pin body
    And I sign a POST request to the current conversation message path "/messages/{message}/pin"
    When I send the signed conversation request
    Then response code is equal to 409
    And response data should match partially
    """
    {
      "code": "OneToOneConversationMessagesNotReplicatedError"
    }
    """

  Scenario: Unpinning a one-to-one message is rejected
    Given I register a test IPFS network "api-one-to-one-unpin-rejected-network"
    And I have created a one-to-one conversation
    And I target an unknown conversation message
    And I set a conversation message unpin body
    And I sign a DELETE request to the current conversation message path "/messages/{message}/pin"
    When I send the signed conversation request
    Then response code is equal to 409
    And response data should match partially
    """
    {
      "code": "OneToOneConversationMessagesNotReplicatedError"
    }
    """

  Scenario: Marking one-to-one messages read is rejected
    Given I register a test IPFS network "api-one-to-one-read-until-rejected-network"
    And I have created a one-to-one conversation
    And I target an unknown conversation message
    And I set a read conversation messages body
    And I sign a PUT request to the current conversation message path "/messages/read-until"
    When I send the signed conversation request
    Then response code is equal to 409
    And response data should match partially
    """
    {
      "code": "OneToOneConversationMessagesNotReplicatedError"
    }
    """
