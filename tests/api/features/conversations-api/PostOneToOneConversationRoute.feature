Feature: Post one-to-one conversation route
  As an API consumer
  I want to create a one-to-one conversation
  So that I can start testing real chat flows

  Scenario: Create one-to-one conversation successfully
    Given I am an anonymous user
    And I set json body
      """
      {
        "firstParticipantIdentityId": "MCowBQYDK2VwAyEAcm8079y5JpYYJ5WzgdqOEFxzdsPWjSkQTwkyw3jHaGE=",
        "secondParticipantIdentityId": "MCowBQYDK2VwAyEAGzo6L01UBtaakv2+X8a5zX7B/TysPhwILTUVZIW/E/U="
      }
      """
    When I POST to "/conversations/1to1"
    Then response code is equal to 200
    And response contains a valid resource with the following fields
      | participantIds[0] | MCowBQYDK2VwAyEAcm8079y5JpYYJ5WzgdqOEFxzdsPWjSkQTwkyw3jHaGE= |
      | participantIds[1] | MCowBQYDK2VwAyEAGzo6L01UBtaakv2+X8a5zX7B/TysPhwILTUVZIW/E/U= |
    And response body should contain "one-to-one:"
