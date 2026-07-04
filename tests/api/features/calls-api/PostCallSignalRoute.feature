Feature: Send call signal
  As an API consumer
  I want to send WebRTC signalling data
  So that participants can negotiate media sessions

  Scenario: Send a signal to a call participant
    Given I register a test IPFS network "api-calls-signal-network"
    And I have created a one-to-one conversation
    And I set a conversation call body
    And I sign the current call start request
    When I POST to "/calls/"
    Then response code is equal to 200
    And I remember the current call
    And I set a call signal body for the other identity
    And I sign the current call signal request
    When I POST a signal to the current call
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | status | active |

  Scenario: Reject signalling to an identity outside the call
    Given I register a test IPFS network "api-calls-invalid-signal-network"
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
