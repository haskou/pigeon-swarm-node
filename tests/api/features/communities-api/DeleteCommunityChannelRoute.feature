Feature: Delete community channel API
  As a community owner
  I want to delete community channels
  So that removed channels and their text messages disappear from the community

  Scenario: Owner deletes a private community text channel and its messages
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-delete-channel-network"
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
    And I sign the current community channel deletion request
    When I DELETE the current community channel
    Then response code is equal to 200
    And response body should not contain "general"
    And I sign the current community channel messages request
    When I GET messages from the current community text channel
    Then response code is equal to 409

  Scenario: Non-owner cannot delete a private community text channel
    Given I am an anonymous user
    And I register a test IPFS network "communities-api-delete-channel-owner-network"
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
    And another identity signs the current community channel deletion request
    When I DELETE the current community channel
    Then response code is equal to 409
    And response body should contain "Community permission denied"
