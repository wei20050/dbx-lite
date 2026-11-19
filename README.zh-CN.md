# DBX Lite

面向 Windows 桌面的数据库客户端，支持 MySQL、PostgreSQL、SQLite、SQL Server、Redis、MongoDB 与 openGauss。

> 本项目基于 [DBX](https://github.com/t8y2/dbx)（Apache-2.0）修改而来。版权归属与修改说明见 [NOTICE](NOTICE)。

[English](README.md) | **简体中文**

## 功能

- SQL 编辑器：补全、格式化、执行计划、保存的 SQL
- 数据表格：行内编辑、筛选、排序、CSV/XLSX 导入导出
- 表结构浏览与编辑、Schema 搜索、ER 图
- 连接管理：SSH 隧道、代理、TLS
- 内置 AI 助手：生成与解释 SQL
- 所有数据库均使用原生驱动，无需额外运行时

## 支持的数据库

| 数据库 | 驱动 |
| --- | --- |
| MySQL | 原生 |
| PostgreSQL | 原生 |
| SQLite | 原生 |
| SQL Server | 原生 |
| Redis | 原生 |
| MongoDB | 原生 |
| openGauss | 原生 |

## 开发

前置条件：Node.js 22+、pnpm 10+、Rust 1.97+，Windows 上还需 Visual Studio C++ 生成工具。

```powershell
pnpm install
pnpm dev:tauri
```

常用检查：

```powershell
pnpm typecheck
pnpm test
pnpm generate:connection-types
cargo check --workspace
```

## 构建

```powershell
pnpm tauri build
```

安装包输出到 `target/release/bundle/`。

## 许可证

Apache-2.0。原始版权与归属信息保留在 [LICENSE](LICENSE) 与 [NOTICE](NOTICE) 中。