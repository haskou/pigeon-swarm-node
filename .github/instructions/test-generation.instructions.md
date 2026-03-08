# Instrucciones de Generación de Tests

## Tipos de Test
- **Unitarios** (Jest):
  - Siempre usa .spec.ts en los archivos generados para testing unitario
  - Usa nombres `ClaseEspecifica.spec.ts`.
  - Todos los tests unitarios van `/tests/unit/`.
  - Usa siempre jest-mock-extended
  - Usa patrón AAA en modo estricto
  - Usa patrón object mother siempre que puedas (sobretodo para aggregate roots y value objects complejos) `/tests/unit/mother`
  - Usa fakerjs siempre que puedas

- **Integración (BDD)**:
  - Usa Cucumber con Gherkin (`PostExpense.feature`).
  - Estructura en "Given, When, Then".
  - Los tests scenarios de api van en /tests/api/features
  - Los tests scenarios de consumers van en /tests/consumers/features o /tests/commands/features dependiendo que carpeta existe

  Ejemplos scenarios de API

Feature: Patch Company API
  As a user of the API
  I want to update company information
  So that I can modify the accounting service request details

  Background:
    Given I have the following "companies"
      | id                       | name      |
      | 660186caafbed95dddbf3bb2 | Company A |
    And I have the following "users"
      | id                       | email       | company                  |
      | 657880b79c5cfe0b0d3b0c2d | foo@bar.com | 660186caafbed95dddbf3bb2 |

  Scenario: Successfully patch company with labor service request as admin
    Given I am authenticated as admin
    And I set json body
      """
      {
        "laborServiceRequest": {
          "contactName": "John Doe",
          "contactPhone": {
            "prefix": "+41",
            "number": "123456789"
          },
          "planType": "labor"
        }
      }
      """
    When I PATCH "/companies"
    Then response status code is equal to 204
    And response body should be empty

  Scenario: Successfully patch company with labor service request as non-admin user
    Given I am authenticated as non admin "660186caafbed95dddbf3bb2"
    And I set json body
      """
      {
        "laborServiceRequest": {
          "contactName": "Jane Smith",
          "contactPhone": {
            "prefix": "+41",
            "number": "987654321"
          },
          "planType": "labor"
        }
      }
      """
    When I PATCH "/companies"
    Then response status code is equal to 204
    And response body should be empty

--- Ejemplo consumers

Feature: Enable features on company creation

  Scenario: Successfully enable features when company is created
    And I have the following "companies"
      | _id                      | email              |
      | 63861da054d8fa4a02a6f4fa | company@taclia.com |
    When I publish to exchange "ms_legacy" event "companies.v1.company.was_created" with payload
      """
      {
        "aggregate_id": "63861da054d8fa4a02a6f4fa",
        "attributes": {}
      }
      """
    Then I wait for 1 seconds
    And ensure message was properly consumed
    And execution has no errors in "companies.v1.enable_features_on_company_created"

  Scenario: Handle errors when enabling features on company creation
    And I have the following "companies"
      | _id                      | email              |
      | 63861da054d8fa4a02a6ffff | company@taclia.com |
    When I publish to exchange "ms_legacy" event "companies.v1.company.was_created" with payload
      """
      {
        "aggregate_id": "63861da054d8fa4a02a6fff0",
        "attributes": {}
      }
      """
    Then I wait for 1 seconds
    And I wait error to be thrown with message "Company with id 63861da054d8fa4a02a6fff0 not exists" in "companies.v1.enable_features_on_company_created"


## Buenas prácticas
- Cobertura mínima de test unitarios del 100% en application y domain.
- Incluye casos felices, negativos y excepciones.
- Sigue patrones establecidos en ejemplos del repositorio real.
