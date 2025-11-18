![Data API](.github/social-card.png)

# Interface Data API

<div align="center">
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://discord.gg/sjK28QHrA7"><img src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000" alt="Discord"></a>
<a href="./docs/1.introduction.md"><img src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000" alt="Documentation"></a>
</div>

A robust framework for building data-driven APIs with a focus on CRUD operations. Interface Data API extends the core API interface with specialized functionality for handling database records, making it simple to create RESTful endpoints for your data models.

## Installation

```bash
ajs module imports add data-api@beta
```

## Documentation

Detailed documentation is available in the `docs` directory:

- [Introduction](./docs/1.introduction.md) - Overview and basic concepts
- [Data Controllers](./docs/2.data-controllers.md) - Creating and using Data API controllers
- [Routes](./docs/3.routes.md) - Defining routes and endpoints
- [Access Rights](./docs/4.access-rights.md) - Managing read and write access of objects fields
- [Validation](./docs/5.validators.md) - Validating requests data data before processing
- [Listing](./docs/6.listable.md) - Retrieving lists of records with pagination
- [Foreign Keys](./docs/7.foreign-keys.md) - Handling foreign key relationships in data models
- [Filters](./docs/8.filters.md) - Applying filters to data queries

## Current Status

This is the development version (`beta`) of the Interface Data API. It is currently in pre-release stage and may undergo changes before the final release. The interface is not considered stable for production use without understanding that breaking changes may occur.

## Versions

| Version | Link                                                                                   | Status                                        |
|---------|----------------------------------------------------------------------------------------|-----------------------------------------------|
| beta    | [data-api@beta](https://github.com/AntelopeJS/data-api/tree/main/output/data-api/beta) | Waiting validation from community to go in v1 |
| 1       | _Not yet released_                                                                     | Planned stable release                        |

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
