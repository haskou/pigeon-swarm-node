Feature: Get IPFS replication status route
  As a node owner
  I want to inspect local IPFS replication responsibility
  So that the node can distribute content safely as the network grows

  Scenario: Read replication status for uploaded content
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner/"
    Then response code is equal to 200
    And I register a test IPFS network "api-replication-status-network"
    And I set raw IPFS content with content type "image/png" and text "hello"
    And I sign the current public IPFS content request
    When I POST to "/ipfs/public"
    Then response code is equal to 201
    And response body should contain "cid"
    Given I sign the current IPFS replication status request
    When I GET "/ipfs/replication/status"
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "summary": {
          "contentCount": 1,
          "localResponsibleCount": 1,
          "releasableCount": 0,
          "totalSizeBytes": 5
        }
      }
      """

  Scenario: Reject replication status from a non-owner
    Given the local node has no owner and no networks
    And I sign the current node owner request
    When I PUT "/node/owner/"
    Then response code is equal to 200

    Given another identity signs the current IPFS replication status request
    When I GET "/ipfs/replication/status"
    Then response code is equal to 403
