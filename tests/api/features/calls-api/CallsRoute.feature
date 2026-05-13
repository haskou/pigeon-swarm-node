Feature: Calls API
  As an API consumer
  I want to signal one-to-one, group and community channel calls
  So that clients can negotiate realtime media without a central media server

  Scenario: Start, inspect, signal and end a one-to-one conversation call
    Given I register an in-memory IPFS network "api-calls-one-to-one-network"
    And I have created a one-to-one conversation
    And I set a conversation call body
    And I sign the current call start request
    When I POST to "/calls/"
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | status     | active       |
      | scope.type | conversation |
    And I remember the current call
    And the other identity signs the current call join request
    When I POST a participant join to the current call
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | status | active |
    And I sign the current calls request
    When I GET current calls
    Then response code is equal to 200
    And response body should contain the current call
    And I sign the current call request
    When I GET the current call
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | status     | active       |
      | scope.type | conversation |
    And I set a call signal body for the other identity
    And I sign the current call signal request
    When I POST a signal to the current call
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | status | active |
    And I sign the current call end request
    When I DELETE the current call
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | status | ended |
    And I sign the current calls request
    When I GET current call history
    Then response code is equal to 200
    And response body should contain the current call

  Scenario: Start a group conversation call
    Given I register an in-memory IPFS network "api-calls-group-network"
    And I have created a group conversation
    And I set a conversation call body
    And I sign the current call start request
    When I POST to "/calls/"
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | status     | active       |
      | scope.type | conversation |

  Scenario: Start a community channel call
    Given I register an in-memory IPFS network "api-calls-community-network"
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
    And I set a community channel call body
    And I sign the current call start request
    When I POST to "/calls/"
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | status     | active            |
      | scope.type | community_channel |

  Scenario: Reject signalling to an identity outside the call
    Given I register an in-memory IPFS network "api-calls-invalid-signal-network"
    And I have created a one-to-one conversation
    And I set a conversation call body
    And I sign the current call start request
    When I POST to "/calls/"
    Then response code is equal to 200
    And I remember the current call
    And I set a call signal body for an unrelated identity
    And I sign the current call signal request
    When I POST a signal to the current call
    Then response code is equal to 409
    And response body should contain "CallParticipantNotFoundError"

  Scenario: Decline a ringing one-to-one call
    Given I register an in-memory IPFS network "api-calls-decline-network"
    And I have created a one-to-one conversation
    And I set a conversation call body
    And I sign the current call start request
    When I POST to "/calls/"
    Then response code is equal to 200
    And I remember the current call
    And the other identity signs the current call leave request
    When I DELETE the current call participant
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | status | missed |
    And response body should contain "declined"
