Feature: Put community channel message API
  As a community member
  I want to edit encrypted community channel messages

  Scenario: Edit an encrypted community channel message
    Given I am an anonymous user
    And I register an in-memory IPFS network "api-community-edit-message-network"
    And I have created a private community text channel
    And I have sent an encrypted community channel message
    And I set an edit community channel message body
    And I sign the current community channel message edition request
    When I PUT the current community channel message
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "encryptedPayload": "edited-community-channel-message-payload"
      }
      """
    And response body should contain "editedAt"
    And I sign the current community channel messages request
    When I GET messages from the current community text channel
    Then response code is equal to 200
    And response body should contain "edited-community-channel-message-payload"
    And response body should contain "editedAt"
