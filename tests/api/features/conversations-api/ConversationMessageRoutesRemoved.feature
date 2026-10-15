Feature: Conversations keep no message log on the node
  One-to-one and group messages travel only through opaque mailboxes.
  The node serves conversation metadata, never messages, reactions, pins
  or read state.

  Scenario Outline: A message route of a <type> conversation does not exist
    Given I register a test IPFS network "<network>"
    And I have created a <type> conversation
    And I target an unknown conversation message
    And I sign a <method> request to the current conversation message path "<path>"
    When I send the signed conversation request
    Then response code is equal to 404

    Examples:
      | type       | network                              | method | path                             |
      | one-to-one | api-one-to-one-no-messages-network   | POST   | /messages                        |
      | one-to-one | api-one-to-one-no-latest-network     | GET    | /messages                        |
      | one-to-one | api-one-to-one-no-read-until-network | PUT    | /messages/read-until             |
      | one-to-one | api-one-to-one-no-message-network    | GET    | /messages/{message}              |
      | one-to-one | api-one-to-one-no-around-network     | GET    | /messages/{message}/around       |
      | one-to-one | api-one-to-one-no-thread-network     | GET    | /messages/{message}/thread       |
      | one-to-one | api-one-to-one-no-edit-network       | PUT    | /messages/{message}              |
      | one-to-one | api-one-to-one-no-delete-network     | DELETE | /messages/{message}              |
      | one-to-one | api-one-to-one-no-reaction-network   | POST   | /messages/{message}/reactions    |
      | one-to-one | api-one-to-one-no-unreaction-network | DELETE | /messages/{message}/reactions    |
      | one-to-one | api-one-to-one-no-pins-network       | GET    | /pins                            |
      | one-to-one | api-one-to-one-no-pin-network        | POST   | /messages/{message}/pin          |
      | one-to-one | api-one-to-one-no-unpin-network      | DELETE | /messages/{message}/pin          |
