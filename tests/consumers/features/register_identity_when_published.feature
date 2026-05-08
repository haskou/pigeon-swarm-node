Feature: Register identity when published

  Scenario: Register a published identity through the consumer
    Given the register identity when published consumer is running
    And a real identity has been created in network "consumer-identity-network"
    Then the register identity when published consumer should finish successfully
