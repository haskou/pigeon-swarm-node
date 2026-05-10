Feature: Get node networks

  Scenario: Read local node networks
    Given the local node has no owner and no networks
    When I GET "/node/networks/"
    Then response code is equal to 200
    And response data should match partially
      """
      {
        "networks": []
      }
      """
