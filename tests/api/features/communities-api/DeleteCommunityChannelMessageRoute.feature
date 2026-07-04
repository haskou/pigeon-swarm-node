Feature: Delete community channel message API
  As a community member
  I want to delete encrypted community channel messages
  So that removed messages stop appearing in the private channel timeline

  Scenario: Member deletes an encrypted private community text channel message
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-delete-message-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community text channel body
    And I sign the current community text channel request
    When I POST a text channel to the current community
    Then response code is equal to 200
    And I remember the current community text channel
    And I set an encrypted community channel message body
    And I sign the current community channel message request
    When I POST a message to the current community text channel
    Then response code is equal to 200
    And I set a delete community channel message body
    And I sign the current community channel message deletion request
    When I DELETE the current community channel message
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "type": "deleted"
      }
      """
    And I sign the current community channel messages request
    When I GET messages from the current community text channel
    Then response code is equal to 200
    And response body should not contain "encrypted-community-channel-message-payload"
