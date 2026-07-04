Feature: Start calls
  As an API consumer
  I want to start one-to-one, group and community channel calls
  So that clients can negotiate realtime media without a central media server

  Scenario: Start a one-to-one conversation call
    Given I register a private IPFS network "api-calls-one-to-one-network"
    And I have created a one-to-one conversation
    And I set a conversation call body
    And I sign the current call start request
    When I POST to "/calls/"
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | status     | active       |
      | scope.type | conversation |

  Scenario: Start a group conversation call
    Given I register a private IPFS network "api-calls-group-network"
    And I have created a group conversation
    And I set a conversation call body
    And I sign the current call start request
    When I POST to "/calls/"
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | status     | active       |
      | scope.type | conversation |

  Scenario: Start a community channel call
    Given I register a private IPFS network "api-calls-community-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community voice channel body
    And I sign the current community voice channel request
    When I POST a voice channel to the current community
    Then response code is equal to 200
    And I remember the current community voice channel
    And I set a community channel call body
    And I sign the current call start request
    When I POST to "/calls/"
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | status     | active            |
      | scope.type | community_channel |
    And I sign the current community channels request
    When I GET channels from the current community
    Then response code is equal to 200
    And response body should contain "connectedIdentityIds"

  Scenario: Ignore extra invitees for a community channel call
    Given I register a private IPFS network "api-calls-community-extra-invitee-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community voice channel body
    And I sign the current community voice channel request
    When I POST a voice channel to the current community
    Then response code is equal to 200
    And I remember the current community voice channel
    And I set a community channel call body with an outside invitee
    And I sign the current call start request
    When I POST to "/calls/"
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | status     | active            |
      | scope.type | community_channel |
    And response body should not contain "MCowBQYDK2VwAyEAA0YLLSFyAaDRgmbqSTJ2gTeRCJq6QfP9RNHHp0/qbtY="

  Scenario: Reuse an active community channel call
    Given I register a private IPFS network "api-calls-community-reuse-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities/"
    Then response code is equal to 200
    And I remember the current community
    And I set a community member body for another identity
    And I sign the current community member request
    When I POST to the current community members
    Then response code is equal to 200
    And I remember the current community membership request
    And I set an accepted community membership request body
    And the community member signs the current membership request update
    When I PATCH the current community membership request
    Then response code is equal to 200
    And I set a community voice channel body
    And I sign the current community voice channel request
    When I POST a voice channel to the current community
    Then response code is equal to 200
    And I remember the current community voice channel
    And I set a community channel call body
    And I sign the current call start request
    When I POST to "/calls/"
    Then response code is equal to 200
    And I remember the current call
    And the community member signs the current call start request
    When I POST to "/calls/"
    Then response code is equal to 200
    And response body should contain the current call
