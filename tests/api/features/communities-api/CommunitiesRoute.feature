Feature: Communities API
  As an API consumer
  I want to manage private communities
  So that identities can organize private spaces in a network

  Scenario: Create a private community successfully
    Given I am an anonymous user
    And I register an in-memory IPFS network "communities-api-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | name       | API community |
      | visibility | private       |
    And response body should contain "bafybeigcommunityavatar"
    And response body should contain "bafybeigcommunitybanner"

  Scenario: Owner adds a member and the member can read the private community
    Given I am an anonymous user
    And I register an in-memory IPFS network "communities-api-member-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community member body for another identity
    And I sign the current community member request
    When I POST to the current community members
    Then response code is equal to 200
    And the community member signs the current communities request
    When I GET current communities
    Then response code is equal to 200
    And response body should contain "API community"
    And the community member signs the current community request
    When I GET the current community
    Then response code is equal to 200
    And response body should contain "Private API community"

  Scenario: Owner creates and renames a private community text channel
    Given I am an anonymous user
    And I register an in-memory IPFS network "communities-api-channel-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community text channel body
    And I sign the current community text channel request
    When I POST a text channel to the current community
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | name | general |
      | type | text    |
    And I remember the current community text channel
    And I set a community text channel rename body
    And I sign the current community text channel rename request
    When I PATCH the current community text channel
    Then response code is equal to 200
    And response body should contain "announcements"

  Scenario: Non-owner cannot create a private community text channel
    Given I am an anonymous user
    And I register an in-memory IPFS network "communities-api-owner-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community text channel body
    And another identity signs the current community text channel request
    When I POST a text channel to the current community
    Then response code is equal to 409
    And response body should contain "Only the community owner"

  Scenario: Member sends and lists encrypted private community text channel messages
    Given I am an anonymous user
    And I register an in-memory IPFS network "communities-api-message-network"
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
    And response body should contain "encrypted-community-channel-message-payload"
    And I sign the current community channel messages request
    When I GET messages from the current community text channel
    Then response code is equal to 200
    And response body should contain "encrypted-community-channel-message-payload"

  Scenario: Member deletes an encrypted private community text channel message
    Given I am an anonymous user
    And I register an in-memory IPFS network "communities-api-delete-message-network"
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

  Scenario: Create a community invitation notification
    Given I am an anonymous user
    And I register an in-memory IPFS network "communities-api-notification-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community invitation notification body
    And I sign the current notification creation request
    When I POST to "/notifications/"
    Then response code is equal to 200
    And response body should contain "community_invitation"
    And response body should contain "encrypted-community-key"
