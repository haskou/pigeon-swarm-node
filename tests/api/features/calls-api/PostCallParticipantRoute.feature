Feature: Join call participant
  As an API consumer
  I want to join active calls
  So that clients can establish media sessions

  Scenario: Join a ringing one-to-one call
    Given I register a test IPFS network "api-calls-join-network"
    And I have created a one-to-one conversation
    And I set a conversation call body
    And I sign the current call start request
    When I POST to "/calls/"
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
    When I POST to "/calls/"
    Then response code is equal to 200
    And I remember the current call
    And the other identity signs the current call join request
    When I POST a participant join to the current call
    Then response code is equal to 200
    And the other identity signs the current call heartbeat request
    When I POST a participant heartbeat to the current call
    Then response code is equal to 200
    And response body should contain "lastSeenAt"
