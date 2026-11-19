# DBX Lite

A Windows desktop database client for MySQL, PostgreSQL, SQLite, SQL Server, Redis, MongoDB, and openGauss.

> Modified fork of [DBX](https://github.com/t8y2/dbx), licensed under Apache-2.0. See [NOTICE](NOTICE) for attribution and modification details.

**English** | [简体中文](README.zh-CN.md)

## Features

- SQL editor with completion, formatting, execution plans, and saved SQL
- Data grid with inline editing, filtering, sorting, and CSV/XLSX import and export
- Table structure browsing and editing, schema search, and ER diagrams
- Connection management with SSH tunnels, proxies, and TLS
- Built-in AI assistant for SQL generation and explanation
- Native drivers for all supported databases; no external runtime required

## Supported databases

| Database | Driver |
| --- | --- |
| MySQL | Native |
| PostgreSQL | Native |
| SQLite | Native |
| SQL Server | Native |
| Redis | Native |
| MongoDB | Native |
| openGauss | Native |

## Development

Prerequisites: Node.js 22+, pnpm 10+, Rust 1.97+, and the Visual Studio C++ build tools on Windows.

```powershell
pnpm install
pnpm dev:tauri
```

Useful checks:

```powershell
pnpm typecheck
pnpm test
pnpm generate:connection-types
cargo check --workspace
```

## Build

```powershell
pnpm tauri build
```

Installers are written to `target/release/bundle/`.

## License

Apache-2.0. Original copyright and attribution are preserved in [LICENSE](LICENSE) and [NOTICE](NOTICE).