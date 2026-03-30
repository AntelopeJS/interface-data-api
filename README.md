# Interface Data API

<div align="center">
<a href="https://www.npmjs.com/package/@antelopejs/interface-data-api"><img src="https://img.shields.io/npm/v/@antelopejs/interface-data-api?style=for-the-badge&labelColor=000000&color=000000" alt="npm"></a>
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=for-the-badge&labelColor=000000"></a>
<a href="https://discord.gg/sjK28QHrA7"><img src="https://img.shields.io/badge/Discord-18181B?logo=discord&style=for-the-badge&color=000000" alt="Discord"></a>
<a href="./docs/1.introduction.md"><img src="https://img.shields.io/badge/Docs-18181B?style=for-the-badge&color=000000" alt="Documentation"></a>
</div>

A declarative framework for building data-driven REST APIs with automatic CRUD operations. Interface Data API connects your database models to API endpoints with built-in validation, access control, foreign key resolution, and pagination.

## Installation

```bash
npm install @antelopejs/interface-data-api
```

## Documentation

Detailed documentation is available in the `docs` directory:

- [Introduction](./docs/1.introduction.md) - Overview, key features, and quick start
- [Data Controllers](./docs/2.data-controllers.md) - Create and configure data controllers
- [Routes](./docs/3.routes.md) - Default routes, custom routes, and route options
- [Access Rights](./docs/4.access-rights.md) - Control field read/write permissions with per-action overrides
- [Validators](./docs/5.validators.md) - Field-level validation and mandatory fields
- [Listable Fields](./docs/6.listable.md) - Pagination, pluck modes, and sorting
- [Foreign Keys](./docs/7.foreign-keys.md) - Establish relationships between tables
- [Filters](./docs/8.filters.md) - Add filtering capabilities to list endpoints
- [Modifiers](./docs/9.modifiers.md) - Automatic data transformation with database-decorators

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
