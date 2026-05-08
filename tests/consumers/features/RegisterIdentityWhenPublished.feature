Feature: Register identity when published

  Scenario: Register a published identity through the consumer
    Given a real identity has been published in network "consumer-identity-network"
    And the local identity registration metadata is missing
    And the register identity when published consumer is running
    When the identity publication is announced
    Then the published identity should be registered locally
