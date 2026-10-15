Feature: Leave call participant
  As an API consumer
  I want to leave or decline calls
  So that call state reflects participant intent

  Scenario: Decline a ringing one-to-one call
    Given I register a test IPFS network "api-calls-decline-network"
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
    And response body should contain "missed"

  Scenario: Keep a group call active when its only other member leaves
    Given I register a test IPFS network "api-calls-group-leave-network"
    And I have published a keychain for the authenticated identity
    And I set a group capability call body
    And I sign the current call start request
    When I POST to "/calls/"
    Then response code is equal to 200
    And I remember the current call
    And I present the group call capability
    And the other identity signs the current call join request
    When I POST a participant join to the current call
    Then response code is equal to 200
    And the other identity signs the current call leave request
    When I DELETE the current call participant
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | status | active |
    And I present no group call capability
    And I sign the current call heartbeat request
    When I POST a participant heartbeat to the current call
    Then response code is equal to 204
    And I sign the current call request
    When I GET the current call
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | status | active |

  Scenario: Refuse a group call join without its capability
    Given I register a test IPFS network "api-calls-group-join-capability-network"
    And I have published a keychain for the authenticated identity
    And I set a group capability call body
    And I sign the current call start request
    When I POST to "/calls/"
    Then response code is equal to 200
    And I remember the current call
    And the other identity signs the current call join request
    When I POST a participant join to the current call
    Then response code is equal to 409
    And response body should contain "CallNotFoundError"
    And I present another group call capability
    And the other identity signs the current call join request
    When I POST a participant join to the current call
    Then response code is equal to 409
    And response body should contain "CallNotFoundError"
    And I set header "authorization" to "Bearer not a capability"
    And the other identity signs the current call join request
    When I POST a participant join to the current call
    Then response code is equal to 409
    And response body should contain "CallNotFoundError"

  Scenario: Reject leaving a call without a signed mutation
    Given I register a test IPFS network "api-calls-unsigned-leave-network"
    And I have created a one-to-one conversation
    And I set a conversation call body
    And I sign the current call start request
    When I POST to "/calls/"
    Then response code is equal to 200
    And I remember the current call
    And call requests are sent without a mutation
    And the other identity signs the current call leave request
    When I DELETE the current call participant
    Then response code is equal to 400
