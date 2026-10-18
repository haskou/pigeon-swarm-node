Feature: Node block sharing

  Background:
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner"
    Then response code is equal to 200

  Scenario: The own block list is served only while it is published
    Given I set a node block list body version 1 blocking "other"
    And I sign a PUT request to "/node/blocks"
    When I PUT "/node/blocks"
    Then response code is equal to 200

    When I GET "/node/published-blocks"
    Then response code is equal to 404
    And response body should contain "404040"

    Given I set json body
      """
      {"published": true}
      """
    And I sign a PUT request to "/node/blocks/publication"
    When I PUT "/node/blocks/publication"
    Then response code is equal to 200
    And response data should match exactly
      """
      {"published": true}
      """

    When I GET "/node/published-blocks" as binary
    Then response code is equal to 200
    And the response is the stored node block list as signed canonical bytes

    Given I set json body
      """
      {"published": false}
      """
    And I sign a PUT request to "/node/blocks/publication"
    When I PUT "/node/blocks/publication"
    Then response code is equal to 200

    When I GET "/node/published-blocks"
    Then response code is equal to 404

  Scenario: The owner adopts a source and lists it
    Given I set json body
      """
      {"origin": "https://publisher.example", "autoApply": false}
      """
    And I sign a PUT request to the block source path ""
    When I send the PUT to the block source path ""
    Then response code is equal to 200
    And response data should match partially
      """
      {"origin": "https://publisher.example", "autoApply": false, "version": null, "pendingCount": 0, "appliedCount": 0}
      """

    Given I sign a GET request to "/node/block-sources"
    When I GET "/node/block-sources"
    Then response code is equal to 200
    And response body should contain the block source publisher id

  Scenario: A source origin that is not public HTTPS is refused
    Given I set json body
      """
      {"origin": "http://publisher.example", "autoApply": false}
      """
    And I sign a PUT request to the block source path ""
    When I send the PUT to the block source path ""
    Then response code is equal to 409
    And response body should contain "InvalidNodeBlockSourceOriginError"

  Scenario: Entries added by a source stay pending until the owner approves them
    Given the node follows a block source whose version 1 blocks the other identity
    And I set json body
      """
      {}
      """
    And another identity signs a POST request to "/realtime/tickets"
    When I POST to "/realtime/tickets"
    Then response code is equal to 201

    Given I sign a GET request to the block source path "/pending-entries"
    When I send the GET to the block source path "/pending-entries"
    Then response code is equal to 200
    And response body should contain the other identity id

    Given I set a block approval body for version 1 choosing the other identity
    And I sign a POST request to the block source path "/approvals"
    When I send the POST to the block source path "/approvals"
    Then response code is equal to 200
    And response data should match partially
      """
      {"version": 1, "pendingCount": 0, "appliedCount": 1}
      """

    Given another identity signs a GET request to "/conversations"
    When I GET "/conversations"
    Then response code is equal to 403
    And response body should contain "403012"

  Scenario: An approval for an outdated version is refused
    Given the node follows a block source whose version 2 blocks the other identity
    And I set a block approval body for version 1 choosing the other identity
    And I sign a POST request to the block source path "/approvals"
    When I send the POST to the block source path "/approvals"
    Then response code is equal to 409
    And response body should contain "NodeBlockSourceVersionHasChangedError"

  Scenario: An auto-applied source blocks at once and removing it unblocks at once
    Given the node follows an auto-applied block source whose version 1 blocks the other identity
    And another identity signs a GET request to "/conversations"
    When I GET "/conversations"
    Then response code is equal to 403
    And response body should contain "403012"

    Given I sign a DELETE request to the block source path ""
    When I send the DELETE to the block source path ""
    Then response code is equal to 200

    Given I set json body
      """
      {}
      """
    And another identity signs a POST request to "/realtime/tickets"
    When I POST to "/realtime/tickets"
    Then response code is equal to 201

  Scenario: A local exception overrides adopted lists
    Given the node follows an auto-applied block source whose version 1 blocks the other identity
    And I set a block exceptions body excepting the other identity
    And I sign a PUT request to "/node/block-exceptions"
    When I PUT "/node/block-exceptions"
    Then response code is equal to 200
    And response body should contain the other identity id

    Given I set json body
      """
      {}
      """
    And another identity signs a POST request to "/realtime/tickets"
    When I POST to "/realtime/tickets"
    Then response code is equal to 201

  Scenario: A local exception does not override the own list
    Given I set a node block list body version 1 blocking "other"
    And I sign a PUT request to "/node/blocks"
    When I PUT "/node/blocks"
    Then response code is equal to 200

    Given I set a block exceptions body excepting the other identity
    And I sign a PUT request to "/node/block-exceptions"
    When I PUT "/node/block-exceptions"
    Then response code is equal to 200

    Given another identity signs a GET request to "/conversations"
    When I GET "/conversations"
    Then response code is equal to 403
    And response body should contain "403012"

  Scenario Outline: A non-owner cannot manage sharing
    Given another identity signs a <method> request to "<path>"
    When I <method> "<path>"
    Then response code is equal to 403
    And response body should contain "403010"

    Examples:
      | method | path                     |
      | GET    | /node/blocks/publication |
      | GET    | /node/block-sources      |
      | GET    | /node/block-exceptions   |

  Scenario: A non-owner cannot change a source
    Given I set json body
      """
      {"origin": "https://publisher.example", "autoApply": true}
      """
    And another identity signs a PUT request to the block source path ""
    When I send the PUT to the block source path ""
    Then response code is equal to 403
    And response body should contain "403010"

  Scenario Outline: The owner cannot except an identity under <encoding> of its key
    Given I set a block exceptions body excepting the other identity under "<encoding>" of its key
    And I sign a PUT request to "/node/block-exceptions"
    When I PUT "/node/block-exceptions"
    Then response code is equal to 400
    And response body should contain "400080"

    Given I sign a GET request to "/node/block-exceptions"
    When I GET "/node/block-exceptions"
    Then response code is equal to 200
    And response data should match exactly
      """
      {"identityIds": [], "nodePeerIds": []}
      """

    Examples:
      | encoding                        |
      | an alias DER prefix             |
      | a non-canonical base64 encoding |

  Scenario Outline: The owner cannot approve an identity under <encoding> of its key
    Given the node follows a block source whose version 1 blocks the other identity
    And I set a block approval body for version 1 choosing the other identity under "<encoding>" of its key
    And I sign a POST request to the block source path "/approvals"
    When I send the POST to the block source path "/approvals"
    Then response code is equal to 400
    And response body should contain "400080"

    Given I set json body
      """
      {}
      """
    And another identity signs a POST request to "/realtime/tickets"
    When I POST to "/realtime/tickets"
    Then response code is equal to 201

    Examples:
      | encoding                        |
      | an alias DER prefix             |
      | a non-canonical base64 encoding |

  Scenario Outline: The owner cannot approve entries of a source named by <encoding> of its key
    Given the node follows a block source whose version 1 blocks the other identity
    And I set a block approval body for version 1 choosing the other identity
    And the block source publisher is named by "<encoding>" of its key
    And I sign a POST request to the block source path "/approvals"
    When I send the POST to the block source path "/approvals"
    Then response code is equal to 400
    And response body should contain "400080"

    Given I set json body
      """
      {}
      """
    And another identity signs a POST request to "/realtime/tickets"
    When I POST to "/realtime/tickets"
    Then response code is equal to 201

    Examples:
      | encoding                        |
      | an alias DER prefix             |
      | a non-canonical base64 encoding |

  Scenario Outline: The owner cannot adopt a source named by <encoding> of its key
    Given the block source publisher is named by "<encoding>" of its key
    And I set json body
      """
      {"origin": "https://publisher.example", "autoApply": true}
      """
    And I sign a PUT request to the block source path ""
    When I send the PUT to the block source path ""
    Then response code is equal to 400
    And response body should contain "400080"

    Given I sign a GET request to "/node/block-sources"
    When I GET "/node/block-sources"
    Then response code is equal to 200
    And response body should not contain "publisher.example"

    Examples:
      | encoding                        |
      | an alias DER prefix             |
      | a non-canonical base64 encoding |

  Scenario Outline: The owner cannot remove a source named by <encoding> of its key
    Given the node follows an auto-applied block source whose version 1 blocks the other identity
    And the block source publisher is named by "<encoding>" of its key
    And I sign a DELETE request to the block source path ""
    When I send the DELETE to the block source path ""
    Then response code is equal to 400
    And response body should contain "400080"

    Given another identity signs a GET request to "/conversations"
    When I GET "/conversations"
    Then response code is equal to 403
    And response body should contain "403012"

    Examples:
      | encoding                        |
      | an alias DER prefix             |
      | a non-canonical base64 encoding |

  Scenario Outline: The owner cannot read the pending entries of a source named by <encoding> of its key
    Given the node follows a block source whose version 1 blocks the other identity
    And the block source publisher is named by "<encoding>" of its key
    And I sign a GET request to the block source path "/pending-entries"
    When I send the GET to the block source path "/pending-entries"
    Then response code is equal to 400
    And response body should contain "400080"
    And response body should not contain the other identity id

    Examples:
      | encoding                        |
      | an alias DER prefix             |
      | a non-canonical base64 encoding |

  Scenario Outline: A non-owner naming a source by an alias is refused as a non-owner on <method> <suffix>
    Given the node follows a block source whose version 1 blocks the other identity
    And the block source publisher is named by "an alias DER prefix" of its key
    And another identity signs a <method> request to the block source path "<suffix>"
    When I send the <method> to the block source path "<suffix>"
    Then response code is equal to 403
    And response body should contain "403010"

    Examples:
      | method | suffix           |
      | DELETE |                  |
      | GET    | /pending-entries |

  Scenario: A non-owner adopting a source named by an alias is refused as a non-owner
    Given the block source publisher is named by "an alias DER prefix" of its key
    And I set json body
      """
      {"origin": "https://publisher.example", "autoApply": true}
      """
    And another identity signs a PUT request to the block source path ""
    When I send the PUT to the block source path ""
    Then response code is equal to 403
    And response body should contain "403010"

  Scenario Outline: A non-owner approving entries of a source named by <encoding> of its key is refused as a non-owner
    Given the node follows a block source whose version 1 blocks the other identity
    And I set a block approval body for version 1 choosing the other identity
    And the block source publisher is named by "<encoding>" of its key
    And another identity signs a POST request to the block source path "/approvals"
    When I send the POST to the block source path "/approvals"
    Then response code is equal to 403
    And response body should contain "403010"

    Examples:
      | encoding                        |
      | an alias DER prefix             |
      | a non-canonical base64 encoding |

  Scenario Outline: A non-owner excepting an identity under <encoding> of its key is refused as a non-owner
    Given I set a block exceptions body excepting the other identity under "<encoding>" of its key
    And another identity signs a PUT request to "/node/block-exceptions"
    When I PUT "/node/block-exceptions"
    Then response code is equal to 403
    And response body should contain "403010"

    Examples:
      | encoding                        |
      | an alias DER prefix             |
      | a non-canonical base64 encoding |

  Scenario Outline: A canonical id of a source the node does not follow is not found on <method> <suffix>
    Given I sign a <method> request to the block source path "<suffix>"
    When I send the <method> to the block source path "<suffix>"
    Then response code is equal to 409
    And response body should contain "NodeBlockSourceNotFoundError"

    Examples:
      | method | suffix           |
      | DELETE |                  |
      | GET    | /pending-entries |

  Scenario Outline: A source list naming an identity under <encoding> of its key is refused and the last valid list kept
    Given the node follows an auto-applied block source whose version 1 blocks the other identity
    And the auto-applied block source publishes version 2 blocking the other identity under "<encoding>" of its key
    And I sign a GET request to "/node/block-sources"
    When I GET "/node/block-sources"
    Then response code is equal to 200
    And response data should match partially
      """
      {"sources": [{"version": 1, "appliedCount": 1, "lastFetchOutcome": "non-canonical-identity-id"}]}
      """

    Examples:
      | encoding                        |
      | an alias DER prefix             |
      | a non-canonical base64 encoding |

  Scenario Outline: A source list stored with an identity under <encoding> of its key never blocks after a restart
    Given the node stored an auto-applied block source list version 1 blocking the other identity under "<encoding>" of its key
    When the node restarts
    And I set json body
      """
      {}
      """
    And another identity signs a POST request to "/realtime/tickets"
    And I POST to "/realtime/tickets"
    Then response code is equal to 201

    Given I sign a GET request to "/node/block-sources"
    When I GET "/node/block-sources"
    Then response code is equal to 200
    And response data should match partially
      """
      {"sources": [{"version": 1, "pendingCount": 0, "appliedCount": 0}]}
      """

    Examples:
      | encoding                        |
      | an alias DER prefix             |
      | a non-canonical base64 encoding |

  Scenario: The owner pages block sources with an opaque cursor
    Given I set json body
      """
      {"origin": "https://publisher.example", "autoApply": false}
      """
    And I sign a PUT request to the block source path ""
    When I send the PUT to the block source path ""
    Then response code is equal to 200

    Given I sign a GET request to "/node/block-sources"
    When I GET "/node/block-sources?limit=1"
    Then response code is equal to 200
    And response "sources" holds 1 items
    And I remember the response next cursor

    Given I sign a GET request to "/node/block-sources"
    When I GET "/node/block-sources?limit=1&cursor=CURSOR" with the remembered page cursor
    Then response code is equal to 200
    And response "sources" holds 0 items
    And the response next cursor is null

  Scenario: A garbage or foreign block source cursor is refused
    Given I sign a GET request to "/node/block-sources"
    When I GET "/node/block-sources?limit=1&cursor=not-a-cursor"
    Then response code is equal to 400
    And response body should contain "400110"

    Given I sign a GET request to "/node/block-sources"
    When I GET "/node/block-sources?limit=1&cursor=CURSOR" with the cursor for resource "registration-codes" at position "550e8400-e29b-41d4-a716-446655440031"
    Then response code is equal to 400
    And response body should contain "400110"

  Scenario Outline: A forged block source cursor is refused
    Given I sign a GET request to "/node/block-sources"
    When I GET "/node/block-sources?limit=1" with a forged "block-sources" cursor at position "<position>"
    Then response code is equal to 400
    And response body should contain "400110"

    Examples:
      | position        |
      | not-an-identity |
      | not-a-key       |

  Scenario: Pending entries page each array with its own opaque cursor
    Given the node follows a block source whose version 1 blocks the other identity
    And I sign a GET request to the block source path "/pending-entries"
    When I send the GET to the block source path "/pending-entries?blockedIdentityIdsLimit=1&blockedNodePeerIdsLimit=1"
    Then response code is equal to 200
    And response "blockedIdentityIds" holds 1 items
    And response "blockedNodePeerIds" holds 0 items
    And the response "blockedNodePeerIds" next cursor is null
    And I remember the response "blockedIdentityIds" next cursor

    Given I sign a GET request to the block source path "/pending-entries"
    When I send the GET to the block source path "/pending-entries?blockedIdentityIdsLimit=1&blockedIdentityIdsCursor=CURSOR" with the remembered "blockedIdentityIds" page cursor
    Then response code is equal to 200
    And response "blockedIdentityIds" holds 0 items
    And the response "blockedIdentityIds" next cursor is null

  Scenario: A pending cursor from one array is refused in the other
    Given the node follows a block source whose version 1 blocks the other identity
    And I sign a GET request to the block source path "/pending-entries"
    When I send the GET to the block source path "/pending-entries?blockedIdentityIdsLimit=1"
    Then response code is equal to 200
    And I remember the response "blockedIdentityIds" next cursor

    Given I sign a GET request to the block source path "/pending-entries"
    When I send the GET to the block source path "/pending-entries?blockedNodePeerIdsLimit=1&blockedNodePeerIdsCursor=CURSOR" with the remembered "blockedIdentityIds" page cursor
    Then response code is equal to 400
    And response body should contain "400110"

  Scenario Outline: A forged pending cursor is refused
    Given the node follows a block source whose version 1 blocks the other identity
    And I sign a GET request to the block source path "/pending-entries"
    When I send the GET to the block source path "/pending-entries?blockedIdentityIdsLimit=1&blockedIdentityIdsCursor=CURSOR" with the cursor for resource "block-source-identities" at position "<position>"
    Then response code is equal to 400
    And response body should contain "400110"

    Examples:
      | position                                  |
      | not-an-identity                           |
      | 12D3KooWD3eckifWpRJ5FeAexqhKVVaBmACPdBCeQ8oTdHxZBJaP |

  Scenario: A forged pending node peer cursor is refused
    Given the node follows a block source whose version 1 blocks the other identity
    And I sign a GET request to the block source path "/pending-entries"
    When I send the GET to the block source path "/pending-entries?blockedNodePeerIdsLimit=1&blockedNodePeerIdsCursor=CURSOR" with the cursor for resource "block-source-node-peers" at position "not-a-peer-id"
    Then response code is equal to 400
    And response body should contain "400110"
