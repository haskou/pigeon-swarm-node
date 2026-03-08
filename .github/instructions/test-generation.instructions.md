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

Feature: Patch example API
As a user of the API
I want to update example information
So that I can modify the accounting service request details

Background:
Given I have the following "examples"
| id | name |
| 660186caafbed95dddbf3bb2 | example A |
And I have the following "users"
| id | email | example |
| 657880b79c5cfe0b0d3b0c2d | foo@bar.com | 660186caafbed95dddbf3bb2 |

Scenario: Successfully patch example with labor service request as admin
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
When I PATCH "/examples"
Then response status code is equal to 204
And response body should be empty

Scenario: Successfully patch example with labor service request as non-admin user
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
When I PATCH "/examples"
Then response status code is equal to 204
And response body should be empty

--- Ejemplo consumers

Feature: Enable features on example creation

Scenario: Successfully enable features when example is created
And I have the following "examples"
| \_id | email |
| 63861da054d8fa4a02a6f4fa | example@gmail.com |
When I publish to exchange "example_exchange" event "examples.v1.example_was_created" with payload
"""
{
"aggregate_id": "63861da054d8fa4a02a6f4fa",
"attributes": {}
}
"""
Then I wait for 1 seconds
And ensure message was properly consumed
And execution has no errors in "examples.v1.enable_features_on_example_created"

Scenario: Handle errors when enabling features on example creation
And I have the following "examples"
| \_id | email |
| 63861da054d8fa4a02a6ffff | example@jas.com |
When I publish to exchange "example_exchange" event "examples.v1.example_was_created" with payload
"""
{
"aggregate_id": "63861da054d8fa4a02a6fff0",
"attributes": {}
}
"""
Then I wait for 1 seconds
And I wait error to be thrown with message "example with id 63861da054d8fa4a02a6fff0 not exists" in "examples.v1.enable_features_on_example_created"

## Buenas prácticas

- Cobertura mínima de test unitarios del 100% en application y domain.
- Incluye casos felices, negativos y excepciones.
- Sigue patrones establecidos en ejemplos del repositorio real.
