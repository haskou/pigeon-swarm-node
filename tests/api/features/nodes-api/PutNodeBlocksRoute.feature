Feature: Put node blocks

  Background:
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200

  Scenario: The owner stores and reads the block list
    Given I set a node block list body version 1 blocking "other"
    And I sign a PUT request to "/node/blocks"
    When I PUT "/node/blocks"
    Then response code is equal to 200
    And response body should contain the other identity id

    Given I sign a GET request to "/node/blocks"
    When I GET "/node/blocks"
    Then response code is equal to 200
    And response body should contain the other identity id

  Scenario: A non-owner cannot store a block list
    Given I set a node block list body version 1 blocking "owner" owned by the other identity and signed by the other identity
    And another identity signs a PUT request to "/node/blocks"
    When I PUT "/node/blocks"
    Then response code is equal to 403
    And response body should contain "403010"

  Scenario: A non-owner cannot read the block list
    Given another identity signs a GET request to "/node/blocks"
    When I GET "/node/blocks"
    Then response code is equal to 403
    And response body should contain "403010"

  Scenario: A version that is not newer is refused
    Given I set a node block list body version 2 blocking "other"
    And I sign a PUT request to "/node/blocks"
    When I PUT "/node/blocks"
    Then response code is equal to 200

    Given I set a node block list body version 2 blocking "nobody"
    And I sign a PUT request to "/node/blocks"
    When I PUT "/node/blocks"
    Then response code is equal to 409
    And response body should contain "NodeBlockListVersionIsNotNewerError"

    Given I set a node block list body version 1 blocking "nobody"
    And I sign a PUT request to "/node/blocks"
    When I PUT "/node/blocks"
    Then response code is equal to 409
    And response body should contain "NodeBlockListVersionIsNotNewerError"

  Scenario: A list signed by another key is refused
    Given I set a node block list body version 1 blocking "other" owned by the owner identity and signed by the other identity
    And I sign a PUT request to "/node/blocks"
    When I PUT "/node/blocks"
    Then response code is equal to 409
    And response body should contain "NodeBlockListSignatureIsNotValidError"

  Scenario: A list owned by another identity is refused
    Given I set a node block list body version 1 blocking "nobody" owned by the other identity and signed by the other identity
    And I sign a PUT request to "/node/blocks"
    When I PUT "/node/blocks"
    Then response code is equal to 409
    And response body should contain "NodeBlockListMustBeSignedByCurrentOwnerError"

  Scenario: An over-size list from the owner is refused
    Given the node block list byte limit is 1024
    And I set a node block list body of 2048 bytes
    And I sign a PUT request to "/node/blocks"
    When I PUT "/node/blocks"
    Then response code is equal to 413

  Scenario: A non-owner is refused before the body is read
    Given the node block list byte limit is 1024
    And I set a node block list body of 2048 bytes
    And another identity signs a PUT request to "/node/blocks"
    When I PUT "/node/blocks"
    Then response code is equal to 403
    And response body should contain "403010"

  Scenario: A stale request is refused before the body is read
    Given the node block list byte limit is 1024
    And I set a node block list body of 2048 bytes
    And I sign the node blocks request with an expired timestamp
    When I PUT "/node/blocks"
    Then response code is equal to 401

  Scenario: A forged owner id with a bad signature is refused before the body is read
    Given the node block list byte limit is 1024
    And I set a node block list body of 2048 bytes
    And another identity signs the node blocks request claiming to be me
    When I PUT "/node/blocks"
    Then response code is equal to 401
    And response body should contain "401020"

  Scenario: A declared body hash the signature does not cover is refused
    Given I set a node block list body version 1 blocking "other"
    And I sign a PUT request to "/node/blocks"
    And I set header "x-body-hash" to "0000000000000000000000000000000000000000000000000000000000000000"
    When I PUT "/node/blocks"
    Then response code is equal to 401
    And response body should contain "401020"

  Scenario: A signed body that is not a block list document is a bad request
    Given I set json body
      """
      {"type":"pigeon-node-block-list","unexpected":true}
      """
    And I sign a PUT request to "/node/blocks"
    When I PUT "/node/blocks"
    Then response code is equal to 400

  Scenario: A blocked identity is refused on signed reads and realtime tickets until unblocked
    Given I set a node block list body version 1 blocking "other"
    And I sign a PUT request to "/node/blocks"
    When I PUT "/node/blocks"
    Then response code is equal to 200

    Given another identity signs a GET request to "/conversations"
    When I GET "/conversations"
    Then response code is equal to 403
    And response body should contain "403012"

    Given I set json body
      """
      {}
      """
    And another identity signs a POST request to "/realtime/tickets"
    When I POST to "/realtime/tickets"
    Then response code is equal to 403
    And response body should contain "403012"

    Given I set a node block list body version 2 blocking "nobody"
    And I sign a PUT request to "/node/blocks"
    When I PUT "/node/blocks"
    Then response code is equal to 200

    Given I set json body
      """
      {}
      """
    And another identity signs a POST request to "/realtime/tickets"
    When I POST to "/realtime/tickets"
    Then response code is equal to 201

  Scenario: The owner is never blocked, even when listed
    Given I set a node block list body version 1 blocking "owner,other"
    And I sign a PUT request to "/node/blocks"
    When I PUT "/node/blocks"
    Then response code is equal to 200

    Given I sign a GET request to "/node/blocks"
    When I GET "/node/blocks"
    Then response code is equal to 200

    Given I set json body
      """
      {}
      """
    And I sign a POST request to "/realtime/tickets"
    When I POST to "/realtime/tickets"
    Then response code is equal to 201

  Scenario: A body that does not match the signed body hash is refused before parsing
    Given I set a node block list body version 1 blocking "other"
    And I sign a PUT request to "/node/blocks"
    And I set a node block list body of 512 bytes
    When I PUT "/node/blocks"
    Then response code is equal to 401
    And response body should contain "401020"

  Scenario: A new owner replaces the previous owner's list whatever its version
    Given I set a node block list body version 9007199254740991 blocking "other"
    And I sign a PUT request to "/node/blocks"
    When I PUT "/node/blocks"
    Then response code is equal to 200

    Given I hand the node over to the other identity
    And I set a node block list body version 1 blocking "nobody" owned by the other identity and signed by the other identity
    And another identity signs a PUT request to "/node/blocks"
    When I PUT "/node/blocks"
    Then response code is equal to 200

  Scenario: An unauthenticated caller cannot tell whether an identity is blocked
    Given I set a node block list body version 1 blocking "other"
    And I sign a PUT request to "/node/blocks"
    When I PUT "/node/blocks"
    Then response code is equal to 200
    And an unauthenticated sealed secrets read of the other identity answers like one of an unblocked identity

  Scenario: Replaying a blocked identity's public record does not reveal the block
    Given I hand the node over to the other identity
    And the current node has a test network with id "123e4567-e89b-12d3-a456-426614174000" and name "identity-network"
    And my identity is published on this node
    When a stranger replays my public identity record
    Given I set a node block list body version 1 blocking "owner" owned by the other identity and signed by the other identity
    And another identity signs a PUT request to "/node/blocks"
    When I PUT "/node/blocks"
    Then response code is equal to 200
    When a stranger replays my public identity record
    Then both replays get the same answer

  Scenario Outline: A blocked identity cannot publish a fork of its held record
    Given I hand the node over to the other identity
    And the current node has a test network with id "123e4567-e89b-12d3-a456-426614174000" and name "identity-network"
    And my identity is published on this node
    And I set a client-signed identity update body with name "Updated Identity", handle "updated-identity" and password "Unused-password1!"
    And I sign the current identity update request
    When I PUT the created identity
    Then response code is equal to 200
    Given I set a node block list body version 1 blocking "owner" owned by the other identity and signed by the other identity
    And another identity signs a PUT request to "/node/blocks"
    When I PUT "/node/blocks"
    Then response code is equal to 200
    Given I set a fork of my identity at version <version>
    And the fork is fetchable over IPFS without being held here
    When I POST to "/identities"
    Then response code is equal to 403
    And response body should contain "403012"

    Examples:
      | version |
      | 1       |
      | 2       |

  Scenario Outline: A blocked identity cannot dodge the block by naming its key by <encoding>
    Given I set a node block list body version 1 blocking "other"
    And I sign a PUT request to "/node/blocks"
    When I PUT "/node/blocks"
    Then response code is equal to 200

    Given another identity signs a GET request to "/conversations"
    And the request names its signer by "<encoding>" of its key
    When I GET "/conversations"
    Then response code is equal to 401
    And response body should contain "401020"

    Examples:
      | encoding                        |
      | an alias DER prefix             |
      | a non-canonical base64 encoding |

  Scenario Outline: A blocked identity cannot publish its key under <encoding> of it
    Given I hand the node over to the other identity
    And the current node has a test network with id "123e4567-e89b-12d3-a456-426614174000" and name "identity-network"
    And I set a node block list body version 1 blocking "owner" owned by the other identity and signed by the other identity
    And another identity signs a PUT request to "/node/blocks"
    When I PUT "/node/blocks"
    Then response code is equal to 200
    Given I set my identity record under "<encoding>" of my key
    When I POST to "/identities"
    Then response code is equal to 400
    And response body should contain "400080"

    Examples:
      | encoding                        |
      | an alias DER prefix             |
      | a non-canonical base64 encoding |

  Scenario Outline: The owner cannot block an identity under <encoding> of its key
    Given I set a node block list body version 1 blocking the other identity under "<encoding>" of its key
    And I sign a PUT request to "/node/blocks"
    When I PUT "/node/blocks"
    Then response code is equal to 400
    And response body should contain "400080"

    Examples:
      | encoding                        |
      | an alias DER prefix             |
      | a non-canonical base64 encoding |

  Scenario Outline: A restart purges a block exception and a source approval stored under <encoding> of a key
    Given the node follows a block source whose version 1 blocks the other identity
    And the node stored the other identity under "<encoding>" of its key as a block exception and a source approval
    When the node restarts
    Then the stored block exception and source approval name only the canonical other identity id
    When I GET "/node"
    Then response code is equal to 200
    And response body should contain "owner"

    Examples:
      | encoding                        |
      | an alias DER prefix             |
      | a non-canonical base64 encoding |

  Scenario Outline: A restart leaves unowned a node whose owner was stored under <encoding> of its key
    Given the local node owner was stored under "<encoding>" of my key
    When the node restarts
    And I GET "/node"
    Then response code is equal to 200
    And response body should not contain "owner"

    Examples:
      | encoding                        |
      | an alias DER prefix             |
      | a non-canonical base64 encoding |

  Scenario Outline: A restart drops an own block list that names an alias of a key by <encoding>
    Given the node stored its own block list version 1 blocking the other identity under "<encoding>" of its key
    When the node restarts
    Then the node has no stored own block list
    When I GET "/node"
    Then response code is equal to 200
    And response body should contain "owner"

    Examples:
      | encoding                        |
      | an alias DER prefix             |
      | a non-canonical base64 encoding |
