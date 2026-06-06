# Serialization Compatibility Report

## Contract Target
- Response payloads must preserve snake_case keys expected by existing Node-integrated clients.

## Implementation
- `ParityMapper` centralizes mapping for client/vendor/project/document/folder/analytics entities.
- Controllers return `success` + `data` envelope where Node contract uses that shape.
- Message-only endpoints retain top-level `message` for compatibility routes.

## Automated Validation
- `ParityMapperSerializationTest` confirms key snake_case fields exist for core entities.
- Route contract test confirms expected route surface is present.

## Status
- Serializer key compatibility checks pass for implemented module payloads.
