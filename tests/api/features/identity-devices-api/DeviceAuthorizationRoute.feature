Feature: Device authorization route
  As an identity owner
  I want device authorization transitions to be verified atomically
  So that copied or replayed control messages cannot authorize a device

  Scenario: Enroll a device once with proof of possession
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "device-authorization-network"
    And I set a client-signed identity body with name "device owner" and handle "device-owner"
    When I POST to "/identities/"
    Then response code is equal to 200
    And the genesis device authorization checkpoint exists
    Given I set a signed device enrollment transition body
    When I POST to "/identity-devices/transitions"
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | revision | 1 |
    And response body should not contain "authorizedCredentialCommitments"
    When I POST to "/identity-devices/transitions"
    Then response code is equal to 409

  Scenario: Reject an undeclared secret on a device authorization transition
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "device-authorization-network"
    And I set a client-signed identity body with name "strict device owner" and handle "strict-device-owner"
    When I POST to "/identities/"
    Then response code is equal to 200
    Given I set a signed device enrollment transition body
    And I add undeclared identity field "recoverySecret"
    When I POST to "/identity-devices/transitions"
    Then response code is equal to 400

  Scenario: Refuse a request signed by a revoked device
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "device-authorization-network"
    And I set a client-signed identity body with name "revoked device owner" and handle "revoked-device"
    When I POST to "/identities/"
    Then response code is equal to 200
    Given I set a signed device enrollment transition body
    When I POST to "/identity-devices/transitions"
    Then response code is equal to 200
    Given the enrolled device signs the current device authorization checkpoint request
    When I GET the current device authorization checkpoint
    Then response code is equal to 200
    Given I set a signed self-retirement transition body for the enrolled device
    When I POST to "/identity-devices/transitions"
    Then response code is equal to 200
    Given the enrolled device signs the current device authorization checkpoint request
    When I GET the current device authorization checkpoint
    Then response code is equal to 401
    And response body should contain "401020"

  Scenario: A revocation without a valid signature changes nothing
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "device-authorization-network"
    And I set a client-signed identity body with name "forged revoke owner" and handle "forged-revoke"
    When I POST to "/identities/"
    Then response code is equal to 200
    Given I set a signed device enrollment transition body
    When I POST to "/identity-devices/transitions"
    Then response code is equal to 200
    Given I set a self-retirement transition body for the enrolled device signed by another key
    When I POST to "/identity-devices/transitions"
    Then response code is equal to 409
    And response body should contain "InvalidDeviceAuthorizationTransitionError"
    Given the enrolled device signs the current device authorization checkpoint request
    When I GET the current device authorization checkpoint
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | revision | 1 |

  Scenario: Read the authenticated identity authorization checkpoint
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "device-authorization-network"
    And I set a client-signed identity body with name "checkpoint owner" and handle "checkpoint-owner"
    When I POST to "/identities/"
    Then response code is equal to 200
    Given I sign the current device authorization checkpoint request
    When I GET the current device authorization checkpoint
    Then response code is equal to 200
    And response is the current device authorization checkpoint

  Scenario: Read the authorization checkpoint during total device recovery
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "device-recovery-network"
    And I set a client-signed identity body with name "recovery owner" and handle "recovery-owner"
    When I POST to "/identities/"
    Then response code is equal to 200
    Given I sign the current device authorization checkpoint recovery request
    When I GET the current device authorization checkpoint
    Then response code is equal to 200
    And response is the current device authorization checkpoint

  Scenario: Refuse a replayed device proof reading the authorization checkpoint
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "device-authorization-network"
    And I set a client-signed identity body with name "checkpoint replay" and handle "checkpoint-replay"
    When I POST to "/identities/"
    Then response code is equal to 200
    Given I sign the current device authorization checkpoint request
    When I GET the current device authorization checkpoint
    Then response code is equal to 200
    When I GET the current device authorization checkpoint
    Then response code is equal to 401
    And response body should contain "401020"

  Scenario: Refuse a replayed recovery proof reading the transition log
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "device-recovery-network"
    And I set a client-signed identity body with name "recovery log replay" and handle "recovery-log-replay"
    When I POST to "/identities/"
    Then response code is equal to 200
    Given I sign the current device transition log recovery request
    When I GET the current device transition log
    Then response code is equal to 200
    When I GET the current device transition log
    Then response code is equal to 401
    And response body should contain "401020"

  Scenario: Refuse device and recovery proofs with an expired timestamp
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "device-authorization-network"
    And I set a client-signed identity body with name "stale proof" and handle "stale-proof"
    When I POST to "/identities/"
    Then response code is equal to 200
    Given requests are signed 61 seconds ago
    And I sign the current device authorization checkpoint request
    When I GET the current device authorization checkpoint
    Then response code is equal to 401
    And response body should contain "401020"
    Given I sign the current device transition log request
    When I GET the current device transition log
    Then response code is equal to 401
    And response body should contain "401020"
    Given I sign the current device transition log recovery request
    When I GET the current device transition log
    Then response code is equal to 401
    And response body should contain "401020"

  Scenario: Require authentication to read a device authorization checkpoint
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "device-authorization-network"
    And I set a client-signed identity body with name "private owner" and handle "private-owner"
    When I POST to "/identities/"
    Then response code is equal to 200
    When I GET the current device authorization checkpoint
    Then response code is equal to 401

  Scenario: Reject a different identity reading a device authorization checkpoint
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "device-authorization-network"
    And I set a client-signed identity body with name "isolated owner" and handle "isolated-owner"
    When I POST to "/identities/"
    Then response code is equal to 200
    Given another identity signs the current device authorization checkpoint request
    When I GET the current device authorization checkpoint
    Then response code is equal to 401

  Scenario: List the authorized devices only to the owner
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "device-authorization-network"
    And I set a client-signed identity body with name "device list owner" and handle "device-list-owner"
    When I POST to "/identities/"
    Then response code is equal to 200
    Given I sign the current device list request
    When I GET the current device list
    Then response code is equal to 200
    And response is the current device list

  Scenario: Reject an unauthenticated device list read
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "device-authorization-network"
    And I set a client-signed identity body with name "device list private" and handle "device-list-private"
    When I POST to "/identities/"
    Then response code is equal to 200
    When I GET the current device list
    Then response code is equal to 401

  Scenario: Reject another identity reading the device list
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "device-authorization-network"
    And I set a client-signed identity body with name "device list isolated" and handle "device-list-isolated"
    When I POST to "/identities/"
    Then response code is equal to 200
    Given another identity signs the current device list request
    When I GET the current device list
    Then response code is equal to 401

  Scenario: Serve the signed device authorization transitions to the owner
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "device-authorization-network"
    And I set a client-signed identity body with name "transition log owner" and handle "transition-log-owner"
    When I POST to "/identities/"
    Then response code is equal to 200
    Given I set a signed device enrollment transition body
    When I POST to "/identity-devices/transitions"
    Then response code is equal to 200
    Given I set a signed self-retirement transition body for the enrolled device
    When I POST to "/identity-devices/transitions"
    Then response code is equal to 200
    Given I sign the current device transition log request
    When I GET the current device transition log
    Then response code is equal to 200
    And response serves the signed device authorization transitions after revision 0
    Given I sign the current device transition log request
    When I GET the current device transition log after revision "1"
    Then response code is equal to 200
    And response serves the signed device authorization transitions after revision 1

  Scenario: Serve a retired device the signed transition that removed it
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "device-authorization-network"
    And I set a client-signed identity body with name "retired log owner" and handle "retired-log-owner"
    When I POST to "/identities/"
    Then response code is equal to 200
    Given I set a signed device enrollment transition body
    When I POST to "/identity-devices/transitions"
    Then response code is equal to 200
    Given I set a signed self-retirement transition body for the enrolled device
    When I POST to "/identity-devices/transitions"
    Then response code is equal to 200
    Given the enrolled device signs the current device transition log request
    When I GET the current device transition log
    Then response code is equal to 200
    And response serves the signed device authorization transitions after revision 0

  Scenario: Serve the signed device authorization transitions during total device recovery
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "device-recovery-network"
    And I set a client-signed identity body with name "recovery log owner" and handle "recovery-log-owner"
    When I POST to "/identities/"
    Then response code is equal to 200
    Given I set a signed device enrollment transition body
    When I POST to "/identity-devices/transitions"
    Then response code is equal to 200
    Given I sign the current device transition log recovery request
    When I GET the current device transition log
    Then response code is equal to 200
    And response serves the signed device authorization transitions after revision 0

  Scenario: Reject a malformed transition log revision
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "device-authorization-network"
    And I set a client-signed identity body with name "log strict" and handle "transition-strict"
    When I POST to "/identities/"
    Then response code is equal to 200
    Given I sign the current device transition log request
    When I GET the current device transition log after revision "01"
    Then response code is equal to 400
    And response body should contain "400050"

  Scenario: Reject an unauthenticated transition log read
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "device-authorization-network"
    And I set a client-signed identity body with name "log private" and handle "transition-private"
    When I POST to "/identities/"
    Then response code is equal to 200
    When I GET the current device transition log
    Then response code is equal to 401

  Scenario: Reject another identity reading the transition log
    Given I am an anonymous user
    And I register a test IPFS network with id "123e4567-e89b-12d3-a456-426614174000" and name "device-authorization-network"
    And I set a client-signed identity body with name "log isolated" and handle "transition-isolated"
    When I POST to "/identities/"
    Then response code is equal to 200
    Given another identity signs the current device transition log request
    When I GET the current device transition log
    Then response code is equal to 401
    And response body should contain "401020"
