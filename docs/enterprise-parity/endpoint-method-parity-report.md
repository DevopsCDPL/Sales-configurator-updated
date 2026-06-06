# Endpoint Method Parity Report

## Scope
- Modules: clients, vendors, projects, documents, file-manager, recycle-bin.
- Validation target: HTTP method + route path parity between Node route contracts and Java parity controllers.

## Contract Sources
- Node routes:
  - `backend/src/routes/clientRoutes.js`
  - `backend/src/routes/vendorRoutes.js`
  - `backend/src/routes/projectRoutes.js`
  - `backend/src/routes/documentRoutes.js`
  - `backend/src/routes/fileManagerRoutes.js`
  - `backend/src/routes/recycleBinRoutes.js`
- Java controllers:
  - `java-backend/src/main/java/com/forge/operations/api/ClientParityController.java`
  - `java-backend/src/main/java/com/forge/operations/api/VendorParityController.java`
  - `java-backend/src/main/java/com/forge/operations/api/ProjectParityController.java`
  - `java-backend/src/main/java/com/forge/operations/api/DocumentParityController.java`
  - `java-backend/src/main/java/com/forge/operations/api/FileManagerParityController.java`
  - `java-backend/src/main/java/com/forge/operations/api/RecycleBinParityController.java`

## Validation Method
- Added strict contract test:
  - `java-backend/src/test/java/com/forge/operations/api/EnterpriseModuleHttpMethodParityTest.java`
- Test behavior:
  - Reflects Java mapping annotations.
  - Produces a `METHOD /path` set.
  - Asserts expected Node parity contract entries exist.

## Results
- Total expected method+path contracts asserted: `67`
- Total missing mappings: `0`
- Test status: passing

## Module Breakdown
- Clients: `5` routes verified.
- Vendors: `6` routes verified.
- Projects: `16` routes verified.
- Documents: `13` routes verified.
- File Manager: `22` routes verified.
- Recycle Bin: `5` routes verified.

## Notes
- This closes static HTTP method/path parity evidence for enterprise modules.
- Response payload byte-for-byte parity and live Node-vs-Java runtime comparison remain separate integration tasks.