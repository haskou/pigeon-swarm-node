Feature: Get IPFS content route
  As an API consumer
  I want to retrieve JSON content from IPFS by CID
  So that I can access distributed content through the API

  Scenario: Retrieve content from IPFS with a stored CID
    Given I am an anonymous user
    And I register a test IPFS network "api-test-network"
    And I store the following json in IPFS network "api-test-network"
      """
      {
        "hello": "world"
      }
      """
    And CID "bagaaierasords4njcts6vs7qvdjfcvgnume4hqohf65zsfguprqphs3icwea" has been created
    When I GET "/ipfs/contents/bagaaierasords4njcts6vs7qvdjfcvgnume4hqohf65zsfguprqphs3icwea"
    Then response code is equal to 200
    And response data should match exactly
      """
      {
        "hello": "world"
      }
      """

  Scenario: Return not ready when CID is not held by any network
    Given I am an anonymous user
    When I GET "/ipfs/contents/bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku"
    Then response code is equal to 503
    And response data should match exactly
      """
      {
        "code": 503020,
        "httpStatus": 503,
        "message": "IPFS content is not reachable on every network yet. Retry shortly."
      }
      """
