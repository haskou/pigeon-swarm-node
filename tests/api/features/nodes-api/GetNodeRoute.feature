Feature: Get node

  Scenario: Read local node information
    Given the local node has no owner and no networks
    When I GET "/node/"
    Then response code is equal to 200
    And response body should contain "id"
    And response body should not contain "owner"
