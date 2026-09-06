Feature: Client compatibility contract

  Scenario: An independent client discovers the public contract without credentials
    Given I set header "Origin" to "https://client.example.com"
    When I GET "/client-contract"
    Then response code is equal to 200
    And response data should match exactly
      """
      {"protocol":"pigeon-swarm","apiVersion":1}
      """
    And response header "Cache-Control" should be "no-store"
    And response header "Access-Control-Allow-Origin" should be "*"

  Scenario: The existing CORS policy permits an independent client preflight
    Given I set header "Origin" to "https://client.example.com"
    And I set header "Access-Control-Request-Method" to "GET"
    And I set header "Access-Control-Request-Headers" to "content-type"
    When I OPTIONS "/client-contract"
    Then response code is equal to 204
    And response header "Access-Control-Allow-Origin" should be "*"
    And response header "Access-Control-Allow-Methods" should contain "GET"
    And response header "Access-Control-Allow-Headers" should contain "content-type"
