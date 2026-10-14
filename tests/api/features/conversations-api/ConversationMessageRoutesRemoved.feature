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
      | group      | api-group-no-messages-network        | POST   | /messages                        |
      | group      | api-group-no-latest-network          | GET    | /messages                        |
      | group      | api-group-no-message-network         | GET    | /messages/{message}              |
      | group      | api-group-no-around-network          | GET    | /messages/{message}/around       |
      | group      | api-group-no-thread-network          | GET    | /messages/{message}/thread       |
      | group      | api-group-no-edit-network            | PUT    | /messages/{message}              |
      | group      | api-group-no-delete-network          | DELETE | /messages/{message}              |
      | group      | api-group-no-reaction-network        | POST   | /messages/{message}/reactions    |
      | group      | api-group-no-unreaction-network      | DELETE | /messages/{message}/reactions    |
      | group      | api-group-no-pins-network            | GET    | /pins                            |
      | group      | api-group-no-pin-network             | POST   | /messages/{message}/pin          |
      | group      | api-group-no-unpin-network           | DELETE | /messages/{message}/pin          |
      | group      | api-group-no-read-until-network      | PUT    | /messages/read-until             |
