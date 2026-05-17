Feature: Get IPFS replication status route
  As a node owner
  I want to inspect local IPFS replication responsibility
  So that the node can distribute content safely as the network grows

  Scenario: Read replication status for uploaded content
    Given I am an anonymous user
    And I register an in-memory IPFS network "api-replication-status-network"
    And I set raw IPFS content with content type "image/png" and text "hello"
    And I sign the current public IPFS content request
    When I POST to "/ipfs/public"
    Then response code is equal to 201
    And response body should contain "cid"
    Given I sign the current IPFS replication status request
    When I GET "/ipfs/replication/status"
    Then response code is equal to 200
    And response body should contain "ipfs_public_upload"
    And response body should contain "desiredReplicas"
    And response body should contain "knownReplicas"
    And response body should contain "localResponsible"
