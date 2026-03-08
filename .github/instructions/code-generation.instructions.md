---
applyTo: "**/*.ts"
---

# Guía Detallada de Generación de Código

## Habla siempre en español

## Utiliza siempre que puedas @app en vez de .. durante los imports
Los imports dentro de la carpeta de /tests si que tienen que ser relativos al path.
No puede usar @app.

## !IMPORTANTE: Añade siempre un tipo de respuesta tipada a los metodos

## !IMPORTANTE: Añadie siempre public private o protected a los metodos

## !IMPORTANTE: Mi aplicación usa autowire para la inyeccion de dependencias. No te acoples a ninguna libreria ni a ningun contenedor de dependencias

📁 Estructura General Recomendada

Asegúrate de que tu proyecto sigue una arquitectura clara como:

src/
├── apps/
│   └── <nombre-app-api>/
│       ├── bodies/
│       ├── requests/
│       ├── routes/
│       ├── voters/
│       ├── resources/
│       └── view-models/
│   └── <nombre-app-consumers>/
│       ├── events/
│       ├── consumers/
├── contexts/
│   └── <nombre-contexto>/
│       ├── application/
│       ├── domain/
│       └── infrastructure/
│   └── <shared-contexto>/
│       ├── application/
│       ├── domain/
│       └── infrastructure/
├── shared/
│   ├── application/
│   ├── domain/
│   ├── infrastructure/


🧱 Ejemplos por Tipo de Archivo

### bodies/ – Interfaces de entrada de datos (Request Bodies)

```ts
import { IsNotEmpty, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AccountingServiceRequestBody } from './AccountingServiceRequestBody';
import { LaborServiceRequestBody } from './LaborServiceRequestBody';

export class PatchCompanyBody {
  @IsOptional()
  @ValidateNested()
  @Type(() => AccountingServiceRequestBody)
  @IsNotEmpty()
  public readonly accountingServiceRequest: AccountingServiceRequestBody;

  @IsOptional()
  @ValidateNested()
  @Type(() => LaborServiceRequestBody)
  @IsNotEmpty()
  public readonly laborServiceRequest: LaborServiceRequestBody;
}
```

### requests/ – Objetos de solicitud de alto nivel (command/query) para luego generar los mensajes de los casos de uso

```ts
export class DeleteCompanyFeaturesRequest {
  constructor(
    private readonly companyId: string,
    private readonly featureName: string,
  ) {}

  public getFeaturesRemoverMessage(): FeaturesRemoverMessage {
    return new FeaturesRemoverMessage(this.companyId, this.featureName);
  }
}
```

### routes/ – Endpoints REST

```ts
import Kernel from '@app/Kernel';
import JWTMiddleware from '@app/shared/infrastructure/Security/JWTValidationMiddleware';
import { RequestUser } from '@app/shared/infrastructure/Session/RequestUserDecorator';
import User from '@app/shared/infrastructure/Session/User';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/UI/Route/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/UI/Route/Route';
import {
  Delete,
  JsonController,
  Param,
  Res,
  UseBefore,
} from 'routing-controllers';
import { Response } from 'express';
import { DeleteCompanyFeaturesRequest } from '../requests/DeleteCompanyFeaturesRequest';
import FeaturesRemover from '@app/contexts/company/application/features-remover/FeaturesRemover';

@JsonController('/features')
export class DeleteCompanyFeaturesRoute extends Route {
  private readonly featuresRemover = this.get<FeaturesRemover>(FeaturesRemover);

  @Delete('/:featureName')
  @UseBefore(JWTMiddleware)
  public async request(
    @RequestUser() user: User,
    @Res() response: Response,
    @Param('featureName') featureName: string,
  ): Promise<Response> {
    try {
      const request = new DeleteCompanyFeaturesRequest(
        user.companyId,
        featureName,
      );
      const message = request.getFeaturesRemoverMessage();
      await this.featuresRemover.remove(message);

      return response.status(HttpRouteStatusEnum.NO_CONTENT).send();
    } catch (error) {
      Kernel.logger.error((error as Error).message);
      Kernel.logger.info((error as Error).stack);
      throw error;
    }
  }
}
```

```ts
import Route from '@app/shared/infrastructure/UI/routes/Route';
import { Body, JsonController, Post, Res } from 'routing-controllers';
import { Response } from 'express';
import { PostConversationBody } from '../bodies/PostConversationBody';
import ConversationStarter from '@app/contexts/conversational/application/conversation-start/ConversationStarter';
import { ConversationStarterMessage } from '@app/contexts/conversational/application/conversation-start/ConversationStarterMessage';
import { ConversationViewModel } from '../view-models/ConversationViewModel';
import Kernel from '@app/Kernel';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/UI/routes/HttpRouteStatusEnum';

@JsonController('/conversations')
export class PostConversationRoute extends Route {
  private readonly starter = this.get<ConversationStarter>(ConversationStarter);

  @Post('/')
  public async request(
    @Body() body: PostConversationBody,
    @Res() response: Response,
  ): Promise<Response> {
    try {
      const message = new ConversationStarterMessage(body.messageContent);
      const result = await this.starter.start(message);
      const resources = new ConversationViewModel(result.conversation);

      return response
        .status(HttpRouteStatusEnum.CREATED)
        .json(resources.toResource());
    } catch (error) {
      Kernel.logger.error((error as Error).message);
      Kernel.logger.info((error as Error).stack);

      throw error;
    }
  }
}
```

### `voters/` – Autorización condicional

```ts
export class ExpenseVoter {
  static canEdit(user: User, expense: Expense): boolean {
    return user.id.equals(expense.ownerId);
  }
}
```

### resources/ – Transformadores de respuesta

```ts
export class ExpenseResource {
  constructor(private expense: Expense) {}

  toJSON() {
    return {
      id: this.expense.id.toString(),
      total: this.expense.amount.total.value,
    };
  }
}
```

### view-models/ – Serialización y presentación de datos

```ts
export class ExpenseViewModel {
  constructor(private expense: Expense) {}

  toJSON() {
    return {
      id: this.expense.id.toString(),
      total: this.expense.amount.total.value,
    };
  }
}
```

### cosumers - Consumers de message bus (async apps)

```ts
import Kernel from '@app/Kernel';
import { CompanyWasCreatedEvent } from '../events/CompanyWasCreatedEvent';
import FeaturesFromSourceAdder from '@app/contexts/company/application/features-adder/FeaturesFromSourceAdder';
import { FeaturesFromSourceAdderMessage } from '@app/contexts/company/application/features-adder/FeaturesFromSourceAdderMessage';
import Consumer from '@app/shared/infrastructure/UI/consumers/Consumer';

export default class EnableFeaturesOnCompanyCreated extends Consumer {
  private readonly adder: FeaturesFromSourceAdder =
    this.get<FeaturesFromSourceAdder>(FeaturesFromSourceAdder);

  public get domainEvent(): typeof CompanyWasCreatedEvent {
    return CompanyWasCreatedEvent;
  }

  public get queueName(): string {
    return 'companies.v1.enable_features_on_company_created';
  }

  public get eventName(): string {
    return CompanyWasCreatedEvent.eventName;
  }

  public get exchange(): string {
    return 'ms_legacy';
  }

  public async handler(event: CompanyWasCreatedEvent): Promise<void> {
    try {
      const message = new FeaturesFromSourceAdderMessage(event.aggregateId);
      await this.adder.add(message);
    } catch (error: unknown) {
      Kernel.logger.error((error as Error).message);
      Kernel.logger.info((error as Error).stack);
      throw error;
    }
  }
}
```

### domain/value-objects/ – Tipos seguros y validados

```ts
export class ExpenseNotes {
  constructor(private readonly value: string) {
    if (value.length > 255) {
      throw new ValueNotInEnumError('ExpenseNotes is too long');
    }
  }

  toString() {
    return this.value;
  }
}
```

```ts
import { PrimitiveOf } from '@tacliatech/domain';
import {
  CampaignChannelEnum,
  CampaignSourceChannel,
} from './CampaignSourceChannel';
import {
  CampaignSourceName,
  CampaignSourceNameEnum,
} from './CampaignSourceName';

export class CampaignSource {
  public static fromPrimitives(
    primitives: PrimitiveOf<CampaignSource>,
  ): CampaignSource {
    return new CampaignSource(
      new CampaignSourceChannel(primitives.channel),
      primitives.name ? new CampaignSourceName(primitives.name) : undefined,
    );
  }

  constructor(
    private readonly channel: CampaignSourceChannel,
    private readonly name?: CampaignSourceName,
  ) {}

  public isGoogleChannel(): boolean {
    return this.channel.isEqual(CampaignChannelEnum.GOOGLE);
  }

  public isMetaChannel(): boolean {
    return this.channel.isEqual(CampaignChannelEnum.META);
  }

  public isBingChannel(): boolean {
    return this.channel.isEqual(CampaignChannelEnum.BING);
  }

  public isBudgetsAndInvoices(): boolean {
    return this.name?.isEqual(CampaignSourceNameEnum.BUDGETS_AND_INVOICES);
  }

  public isTimeControl(): boolean {
    return this.name?.isEqual(CampaignSourceNameEnum.TIME_CONTROL);
  }

  public isBillingProgram(): boolean {
    return this.name?.isEqual(CampaignSourceNameEnum.BILLING_PROGRAM);
  }

  public isCrmClientManagement(): boolean {
    return this.name?.isEqual(CampaignSourceNameEnum.CRM_CLIENT_MANAGEMENT);
  }

  public toPrimitives() {
    return {
      channel: this.channel.valueOf(),
      name: this.name?.valueOf(),
    };
  }
}
```

```ts
import { EnumValueObject } from '@tacliatech/domain';

export enum CampaignSourceNameEnum {
  BUDGETS_AND_INVOICES = 'budgets_and_invoices',
  TIME_CONTROL = 'time_control',
  BILLING_PROGRAM = 'billing_program',
  CRM_CLIENT_MANAGEMENT = 'crm_client_management',
}
```

```ts
// eslint-disable-next-line max-len
export class CampaignSourceName extends EnumValueObject<CampaignSourceNameEnum> {
  public static readonly BUDGETS_AND_INVOICES = new CampaignSourceName(
    CampaignSourceNameEnum.BUDGETS_AND_INVOICES,
  );

  public static readonly TIME_CONTROL = new CampaignSourceName(
    CampaignSourceNameEnum.TIME_CONTROL,
  );

  public static readonly BILLING_PROGRAM = new CampaignSourceName(
    CampaignSourceNameEnum.BILLING_PROGRAM,
  );

  public static readonly CRM_CLIENT_MANAGEMENT = new CampaignSourceName(
    CampaignSourceNameEnum.CRM_CLIENT_MANAGEMENT,
  );

  constructor(value: string | CampaignSourceNameEnum) {
    super(CampaignSourceNameEnum, value as CampaignSourceNameEnum);
  }
}
```

```ts
import { EnumValueObject } from '@tacliatech/domain';

export enum CampaignChannelEnum {
  GOOGLE = 'google', // adwords,google
  META = 'meta', // facebook,meta_ads
  BING = 'bing', // bing
}

// eslint-disable-next-line max-len
export class CampaignSourceChannel extends EnumValueObject<CampaignChannelEnum> {
  constructor(value: string | CampaignChannelEnum) {
    super(CampaignChannelEnum, value as CampaignChannelEnum);
  }
}
```

```ts
import { StringValueObject } from '@tacliatech/domain';

export class LaborServiceRequestName extends StringValueObject {}
```


### domain/errors/ – Errores personalizados

```ts
export class ExpenseNotFoundError extends BaseError {
  constructor() {
    super('Expense not found');
  }
}
```

### domain/events/ – Eventos de dominio

```ts
import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class CompanyEmailWasChangedEvent extends DomainEvent {
  public eventName(): string {
    return 'companies.v1.company.email_was_changed';
  }
}
```


### application/{caso-de-uso}/ – Casos de uso

```ts
export class ExpenseCreator {
  constructor(private repo: ExpenseRepository) {}

  public async create(message: ExpenseCreatorMessage): Promise<void> {
    const expense = new Expense(...);
    await this.repo.save(expense);
  }
}
```

### application/{caso-de-uso}/  - Mensaje del caso de uso

```ts
import { ShortId } from '@tacliatech/domain';

export class ExpenseCreatorMessage {
  public readonly userId: ShortId;

  constructor(userId: string) {
    this.userId = new ShortId(userId);
  }
}
```

### infrastructure/mongo/ – Adaptadores de persistencia

```ts
export class MongoExpenseRepository implements ExpenseRepository {
  public async save(expense: Expense): Promise<void> {
    await Mongo.collection('expenses').insertOne(expense.toPrimitives());
  }
}
```

💬 Prompts Sugeridos para Copilot Chat

"Genera un value object llamado ExpenseNotes que valide que el texto no supere 255 caracteres."

"Crea un error customizado llamado InvalidExpenseAmountError que extienda de BaseError."

"Diseña una clase llamada ExpenseDetailsUpdater que actualice los detalles si hay cambios."

"Escribe una clase ViewModel para Expense que serialice su id y monto total."

"Agrega una nueva ruta PATCH en routes/ que actualice el campo notes de un gasto."

✅ Validaciones Recomendadas

Todas las entidades deben tener su ID como value object.

Los campos numéricos deben ser validados para no aceptar NaN o negativos si no están permitidos.

Los DTOs deben tener tipado estricto y sin campos opcionales innecesarios.

Las rutas deben siempre parsear correctamente los datos con seguridad antes de invocar lógica.

🔧 Tips Extra

Usa readonly para inmutabilidad.

Evita clases sin métodos (usa value objects en su lugar).

Extrae los tipos en archivos independientes si son compartidos.

Usa MessageBuilder o Message como nombre para los comandos que representen acciones.

Este archivo puede ser incluido en tu repositorio o en la documentación interna para asegurar consistencia al usar GitHub Copilot Chat en entornos profesionales de desarrollo.

## Normas Específicas
- Prohibidos métodos setters (`set`). Usa métodos explícitos (ej: `expense.updateAmount()`)
- Constructores con máximo 3 parámetros.

## Convenciones estrictas de naming
- Sigue Google's TypeScript Style Guide.
- Servicios: `ExpenseCreator.ts`
- Value Objects: Ejemplos específicos como `ExpenseAmount.ts`, `ExpenseDetails.ts`, `ExpenseCategorization.ts`
- Repositorios: Ejemplos concretos como `ExpenseRepository.ts`
- Eventos (MessageBus): `contexto.version.entidad.acción`, ej.: `expenses.v1.expense.was_created`


# Instrucciones de Generación de Tests

## !IMPORTANTE: Todo el codigo de los tests tiene que estar en ingles. 


ç## !IMPORTANTE: Los titles de los tests tienen que estar en ingles

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
