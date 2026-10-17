Feature: Request body validation
  As a node operator
  I want malformed and oversized request bodies to be refused as client errors
  So that a client cannot make the node fail or buffer unbounded input

  Scenario: Refuse a malformed JSON body
    Given I am an anonymous user
    And I set the raw JSON body "{\"name\": "
    When I POST to "/identities"
    Then response code is equal to 400

  Scenario: Refuse an oversized JSON body
    Given I am an anonymous user
    And I set a JSON body of 20 megabytes
    When I POST to "/identities"
    Then response code is equal to 413
