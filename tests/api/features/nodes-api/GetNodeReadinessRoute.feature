Feature: Node readiness

  Scenario: A started node reports that its replicated state is open without credentials
    Given the current node has a test network with id "123e4567-e89b-12d3-a456-426614174991" and name "node-readiness-network"
    When I GET "/node/readiness"
    Then response code is equal to 200
    And response data should match exactly
      """
      {"status":"ready"}
      """
    And response header "Cache-Control" should be "no-store"
