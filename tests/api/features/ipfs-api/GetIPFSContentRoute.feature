Feature: Get IPFS content route
  As an API consumer
  I want to retrieve JSON content from IPFS by CID
  So that I can access distributed content through the API

  Scenario: Retrieve content from IPFS with a stored CID
    Given I am an anonymous user
    And I register an in-memory IPFS network "api-test-network"
    And I store the following json in IPFS network "api-test-network"
      """
      {
        "hello": "world"
      }
      """
    And CID "bagaaierasords4njcts6vs7qvdjfcvgnume4hqohf65zsfguprqphs3icwea" has been created
    When I GET "/ipfs/bagaaierasords4njcts6vs7qvdjfcvgnume4hqohf65zsfguprqphs3icwea"
    Then response code is equal to 200
    And response data should match exactly
      """
      {
        "hello": "world"
      }
      """

  Scenario: Return not found when CID does not exist in any network
    Given I am an anonymous user
    When I GET "/ipfs/bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku"
    Then response code is equal to 404
    And response data should match exactly
      """
      {
        "error": "CID not found in any network"
      }
      """
