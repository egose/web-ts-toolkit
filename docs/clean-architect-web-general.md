# Clean Architecture for Web Backends

## Core Principle: The Dependency Rule

Dependencies point inward. Outer layers depend on inner layers. Inner layers never depend on outer layers.

```
Frameworks & Drivers (Express, Fastify, Prisma, Mongoose)
        ↓
Interface Adapters (Controllers, Repositories, Presenters)
        ↓
Application Services (Use Cases, Orchestration)
        ↓
Domain (Entities, Value Objects, Business Rules)
```

The domain layer is the most stable. The framework layer is the most replaceable.

## Layer Responsibilities

### Domain Layer

Owns business rules. Knows nothing about databases, HTTP, or frameworks.

What belongs here:

- Entities (domain objects with identity)
- Value objects (immutable, no identity)
- Domain errors
- Business rule validation
- Domain events (optional)

What does not belong here:

- Database queries
- HTTP request/response types
- Configuration
- External service calls

### Application Layer (Services / Use Cases)

Orchestrates domain objects to fulfill a use case. Defines what the system does, not how it does it.

What belongs here:

- Use case orchestration
- Transaction boundaries
- Permission checks (ACL, RBAC)
- Input validation (business rules, not format)
- Domain event publishing

What does not belong here:

- HTTP status codes
- Database driver calls
- Framework-specific types
- Response formatting

### Interface Adapters Layer

Translates between external formats and internal domain/application types.

What belongs here:

- Controllers (HTTP → application call)
- Repository implementations (domain → database)
- Presenters (domain → response DTO)
- Message handlers (queue → application call)

What does not belong here:

- Business logic
- Direct database driver usage without a repository abstraction

### Frameworks & Drivers Layer

Third-party integrations and infrastructure. The most volatile layer.

What belongs here:

- Express/Fastify route registration
- Database client setup
- Logger configuration
- Cache client setup
- Email/queue/storage clients

What does not belong here:

- Business logic
- Domain rules

## Directory Structure

### Feature-based (recommended for most projects)

```
src/
  features/
    users/
      domain/          # entities, value objects, domain errors
      application/     # use cases, service interfaces
      infrastructure/  # repository implementations, external adapters
      presentation/    # controllers, DTOs, route definitions
    orders/
      domain/
      application/
      infrastructure/
      presentation/
  shared/              # cross-feature utilities
  frameworks/          # database setup, logger, config
```

### Layer-based (better for small projects)

```
src/
  domain/              # entities, value objects
  application/         # services, use cases
  adapters/            # controllers, repositories
  infrastructure/      # database, cache, email clients
  frameworks/          # Express setup, middleware
```

## Naming Conventions

### Files

| Concept                   | Suffix                      | Example                     |
| ------------------------- | --------------------------- | --------------------------- |
| Entity                    | `.entity.ts`                | `user.entity.ts`            |
| Value object              | `.vo.ts`                    | `email.vo.ts`               |
| Repository interface      | `.repository.ts`            | `user.repository.ts`        |
| Repository implementation | `.repository.ts` (in infra) | `prisma-user.repository.ts` |
| Service / Use case        | `.service.ts`               | `create-user.service.ts`    |
| Controller                | `.controller.ts`            | `user.controller.ts`        |
| Route                     | `.routes.ts`                | `user.routes.ts`            |
| DTO                       | `.dto.ts`                   | `create-user.dto.ts`        |
| Middleware                | `.middleware.ts`            | `auth.middleware.ts`        |
| Mapper                    | `.mapper.ts`                | `user.mapper.ts`            |

### Classes and Functions

| Concept              | Pattern                 | Example                            |
| -------------------- | ----------------------- | ---------------------------------- |
| Entity class         | Noun                    | `User`, `Order`                    |
| Value object         | Noun (immutable)        | `Email`, `Money`                   |
| Repository interface | Verb (present tense)    | `UserRepository.findById()`        |
| Service / Use case   | Verb (imperative)       | `CreateUser`, `GetOrder`           |
| Controller method    | Verb (matches use case) | `handleCreateUser`                 |
| DTO                  | Noun + `DTO` suffix     | `CreateUserDTO`                    |
| Error class          | Noun + `Error` suffix   | `NotFoundError`, `ValidationError` |

## HTTP Layer Rules

### Controllers

- Unpack request → call service → return value or throw
- Never contain business logic
- Never call the database directly
- Map domain errors to HTTP status codes
- Return typed response objects, not raw database rows

```
Request → Controller → Service → Repository → Database
Response ← Controller ← Service ← Repository ← Database
```

### Routes

- Map HTTP method + path to a controller
- Apply middleware (auth, validation, rate limiting)
- No business logic in route handlers
- Route files are small: just the mapping

### Middleware

- Short, single-purpose functions
- Auth checks, request parsing, logging, rate limiting
- Modify `req`/`res` or throw errors
- Never call domain services directly

## Data Layer Rules

### Repository Pattern

- Interface defined in application/domain layer
- Implementation in infrastructure layer
- One repository per aggregate root (not per table)
- Methods use domain types, not database types
- Repository is the only place that knows the database schema

### Model vs Entity vs DTO

| Type   | Purpose                                        | Where used                  |
| ------ | ---------------------------------------------- | --------------------------- |
| Entity | Domain object with identity and business rules | Domain + application        |
| Model  | Database schema definition (Mongoose, Prisma)  | Infrastructure only         |
| DTO    | Data transfer between layers                   | Presentation / API boundary |

### Mapping

- Map between layers at boundaries
- Database model → Domain entity (in repository)
- Domain entity → Response DTO (in controller/presenter)
- Request DTO → Domain types (in service input)

## Error Handling

### Typed Errors

- Define domain-specific error classes
- Each error maps to an HTTP status code
- Errors carry context (resource ID, field name, etc.)
- Never throw raw `Error` or string errors

```
Domain errors:  NotFoundError, ConflictError, ForbiddenError
App errors:     ValidationError, ConfigurationError
Infra errors:   DatabaseError, TimeoutError
```

### Error Boundaries

- Catch at the HTTP adapter layer (controller or framework middleware)
- Format into a consistent error response shape
- Log at the boundary, not inside domain code
- Domain code throws, adapter layer catches and formats

## Validation

### Where validation lives

| Type                | Layer                | Example                                   |
| ------------------- | -------------------- | ----------------------------------------- |
| Format validation   | Interface adapter    | Email format, string length               |
| Business validation | Domain / application | "email must be unique", "order total > 0" |
| Auth validation     | Middleware           | Token validity, permission check          |

### Validation flow

```
Request → Format validation (adapter) → Business validation (service) → Domain
```

- Format validation rejects malformed input early
- Business validation enforces domain rules
- Both should produce typed errors, not string messages

## Configuration

- Environment variables read once at startup
- Passed through dependency injection or a config object
- Never read `process.env` inside domain or application code
- Config is a framework-layer concern

## Testing Strategy

| Layer       | Test type        | What to test                                   |
| ----------- | ---------------- | ---------------------------------------------- |
| Domain      | Unit test        | Business rules, value objects, entity behavior |
| Application | Unit test        | Use case orchestration, permission logic       |
| Adapter     | Unit test        | Mapping, formatting, error translation         |
| Integration | Integration test | Repository + database, service + repository    |
| E2E         | End-to-end test  | Full HTTP request → response                   |

### Test pyramid

```
        /   E2E    \       few, slow, high confidence
       /------------\
      / Integration  \     moderate, test boundaries
     /----------------\
    /   Unit tests     \   many, fast, isolated
```

## Key Principles

1. **Dependency Rule** — inner layers never import from outer layers
2. **Stable Abstractions** — abstractions live in the domain, implementations in the framework layer
3. **Explicit over implicit** — dependencies are injected, not imported from globals
4. **Single responsibility** — each module does one thing
5. **Composition over inheritance** — prefer function composition and interfaces
6. **Fail fast** — validate early, throw typed errors, don't suppress failures
