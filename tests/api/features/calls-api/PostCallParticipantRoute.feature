Feature: Join call participant
  As an API consumer
  I want to join active calls
  So that clients can establish media sessions

  Scenario: Join a ringing one-to-one call
    Given I register a test IPFS network "api-calls-join-network"
    And I have created a one-to-one conversation
    And I set a conversation call body
    And I sign the current call start request
    When I POST to "/calls"
    Then response code is equal to 200
    And I remember the current call
    And the other identity signs the current call join request
    When I POST a participant join to the current call
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | status | active |

  Scenario: Refresh joined participant heartbeat
    Given I register a test IPFS network "api-calls-heartbeat-network"
    And I have created a one-to-one conversation
    And I set a conversation call body
    And I sign the current call start request
    When I POST to "/calls"
    Then response code is equal to 200
    And I remember the current call
    And the other identity signs the current call join request
    When I POST a participant join to the current call
    Then response code is equal to 200
    And the other identity signs the current call heartbeat request
    When I POST a participant heartbeat to the current call
    Then response code is equal to 204

  Scenario: Reject a heartbeat reporting a media connection to a participant that already left
    Given I register a test IPFS network "api-calls-heartbeat-departed-network"
    And I have created a one-to-one conversation
    And I set a conversation call body
    And I sign the current call start request
    When I POST to "/calls"
    Then response code is equal to 200
    And I remember the current call
    And the other identity signs the current call join request
    When I POST a participant join to the current call
    Then response code is equal to 200
    And the other identity signs a heartbeat reporting a media connection to a departed participant
    When I POST a participant heartbeat to the current call
    Then response code is equal to 409
    And response body should contain "InvalidCallParticipantMediaConnectionError"

  Scenario: Reject joining a call without a signed mutation
    Given I register a test IPFS network "api-calls-unsigned-join-network"
    And I have created a one-to-one conversation
    And I set a conversation call body
    And I sign the current call start request
    When I POST to "/calls"
    Then response code is equal to 200
    And I remember the current call
    And call requests are sent without a mutation
    And the other identity signs the current call join request
    When I POST a participant join to the current call
    Then response code is equal to 400

  Scenario: Reject replaying a community join after the member left
    Given I register a test IPFS network "api-calls-community-replay-network"
    And I set a private community body
    And I sign the current community creation request
    When I POST to "/communities"
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
    When I POST to "/calls"
    Then response code is equal to 200
    And I remember the current call
    And the other identity signs the current call join request
    And I remember the current call join request
    When I POST a participant join to the current call
    Then response code is equal to 200
    And the other identity signs the current call leave request
    When I DELETE the current call participant
    Then response code is equal to 200
    When I POST the remembered participant join to the current call
    Then response code is equal to 401
    And I sign the current call request
    When I GET the current call
    Then response code is equal to 200
    And the current call does not list the other identity as a participant
