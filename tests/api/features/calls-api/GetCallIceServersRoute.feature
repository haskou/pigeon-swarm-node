Feature: Get call ICE servers
  As an API consumer
  I want to read TURN/STUN configuration
  So that clients can configure WebRTC calls

  Scenario: Read TURN configuration for calls
    Given calls use a test TURN server
    And I sign the current call ICE servers request
    When I GET call ICE servers
    Then response code is equal to 200
    And response body should contain "turn:test-turn.local:3478?transport=udp"
    And response body should contain "relay"

  Scenario: Read discovered TURN relay configuration for calls
    Given calls use a test TURN server
    And a remote TURN relay has been discovered for calls
    And I sign the current call ICE servers request
    When I GET call ICE servers
    Then response code is equal to 200
    And response body should contain "turn:test-turn.local:3478?transport=udp"
    And response body should contain "turn:remote-turn.local:3478?transport=udp"
