[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/siyuan-query-mcp)](https://www.npmjs.com/package/siyuan-query-mcp)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-support-orange?logo=buy-me-a-coffee)](https://buymeacoffee.com/myrko.f)

# SiYuan MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for [SiYuan Note](https://b3log.org/siyuan/), enabling AI assistants (Claude, Cursor, etc.) to read, write, and manage your SiYuan workspace — including full CRUD for **Attribute View databases** (SiYuan's relational database system, similar to Notion databases).

## v2.0 — Optimized for LLMs

v2 reduces the tool surface from 70 tools to **17**, because LLMs perform better with fewer, well-designed tools. All read operations are consolidated into `siyuan_sql` (leveraging SiYuan's built-in SQLite), while Attribute View databases retain dedicated tools (they use JSON storage, not SQLite).

---

## 17 Tools

| # | Tool | What it does |
|---|------|-------------|
| 1 | `siyuan_sql` | Run any SQL query on SiYuan's SQLite — replaces 15+ read tools (search, tags, backlinks, blocks, docs) |
| 2 | `read_database` | Read an AV database (fields + entries), list all databases, filter entries, or get a single entry |
| 3 | `workspace_map` | Get all notebook IDs, document tree (2 levels), and database IDs in one call |
| 4 | `create_document` | Create a document or subdocument (nested path: `/Parent/Child`) |
| 5 | `update_document` | Rename, replace content, and/or move a document |
| 6 | `delete_document` | Delete a document (with cascade + dryRun support) |
| 7 | `insert_block` | Insert a block (markdown, heading, list, code, etc.) |
| 8 | `update_block` | Update a block's content |
| 9 | `batch_block_ops` | Batch insert/update/delete blocks in one call |
| 10 | `create_database` | Create an AV database (standalone or embedded in a document) |
| 11 | `write_db_rows` | Create one or more entries in a database |
| 12 | `update_db_cells` | Update cells across one or more entries |
| 13 | `delete_db_rows` | Delete entries from a database |
| 14 | `manage_db_fields` | Add or remove fields (columns) in a database |
| 15 | `set_block_attrs` | Set custom attributes on any block |
| 16 | `upload_asset` | Upload a file (base64) to the workspace |
| 17 | `list_notebooks` | List notebooks (optionally create one) |

**Supported AV field types (read/write):** `text`, `number`, `checkbox`, `select`, `mSelect`, `date`, `url`, `email`, `phone`, `mAsset`

**System fields (read-only):** `created`, `updated`, `lineNumber`, `template`, `rollup`, `relation`

---

## Installation

### Prerequisites
- [SiYuan Note](https://b3log.org/siyuan/en/) running (local or remote)
- Node.js 18+

### Get your API token
In SiYuan: **Settings > About > API token** > copy.

### Option 1 — npx (recommended)

Add to your MCP client config (Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "siyuan": {
      "command": "npx",
      "args": ["-y", "siyuan-query-mcp@latest"],
      "env": {
        "SIYUAN_API_TOKEN": "your-token-here"
      }
    }
  }
}
```

For remote SiYuan or non-default port:
```json
"env": {
  "SIYUAN_API_TOKEN": "your-token-here",
  "SIYUAN_API_URL": "http://192.168.1.100:6806"
}
```

### Option 2 — From source

```bash
git clone https://github.com/MyrkoF/siyuan-mcp.git
cd siyuan-mcp/siyuan-mcp-server
npm install && npm run build
```

```json
{
  "mcpServers": {
    "siyuan": {
      "command": "node",
      "args": ["/path/to/siyuan-mcp-server/dist/index.js"],
      "env": {
        "SIYUAN_API_TOKEN": "your-token-here"
      }
    }
  }
}
```

---

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `SIYUAN_API_TOKEN` | **Yes** | SiYuan API token (Settings > About) |
| `SIYUAN_API_URL` | No | SiYuan base URL. If omitted, auto-discovers port 6806-6808. |

Legacy aliases: `SIYUAN_TOKEN`, `SIYUAN_BASE_URL`

---

## Workspace Map (recommended)

Generate a workspace map with `workspace_map` and paste it into your AI client's Project Instructions. This gives the LLM all notebook and database IDs upfront, skipping discovery calls.

```
Call workspace_map
```

Returns notebook tree (2 levels) + all database IDs, formatted as Markdown.

---

## Quick Start Workflows

### Create a document with a database

```
1. create_document(notebook: "id", path: "/My Page", title: "My Page")
   → returns document block ID

2. create_database(notebookId: "id", name: "My DB",
     parentDocId: "<doc ID from step 1>",
     fields: [{name: "Status", type: "select"}, {name: "Due", type: "date"}])
   → database appears embedded inside the document
```

### Read and query data

```
# SQL for documents, blocks, tags, backlinks:
siyuan_sql(stmt: "SELECT * FROM blocks WHERE type='d' AND content LIKE '%project%'")

# AV databases (not in SQLite):
read_database(id: "avId")
read_database(id: "avId", filter: {field: "Status", value: "Active"})
```

### Move documents

```
update_document(id: "docId", parentId: "targetParentDocId")
# Combine with rename:
update_document(id: "docId", title: "New Name", parentId: "targetId")
```

---

## How AV Writes Work

SiYuan uses dual storage for Attribute View databases:

| Layer | Contains | Updated by |
|-------|----------|------------|
| Kernel in-memory model | Live state | SiYuan `/api/av/` endpoints |
| JSON files (`/data/storage/av/*.json`) | Persisted state | SiYuan (sync from kernel) |

All entry/field operations use SiYuan's official `/api/av/` endpoints (kernel-native). Only `create_database` writes to the JSON file directly (no HTTP API exists for DB creation). Everything is pure HTTP — no local filesystem access required.

---

## MCP Resources

The server exposes static guides as MCP resources:

- `siyuan://static/guide` — Object model, ID lookup, field types, what doesn't work
- `siyuan://static/workflows` — Step-by-step CRUD workflows for all operations

Read them in your MCP client to get detailed usage guidance.

---

## Development

```bash
npm install
npm run build
npx tsc --noEmit  # type-check only
```

---

## Attribution

This project is a fork of [GALIAIS/siyuan-mcp-server](https://github.com/GALIAIS/siyuan-mcp-server).

The original project provided the foundational MCP server structure for SiYuan. This fork adds:

- **v2 tool consolidation** — 70 tools reduced to 17 for better LLM performance
- **SQL-first reads** — `siyuan_sql` replaces 15+ read tools
- **Full Attribute View database CRUD** — create, read, write, update, delete databases and entries
- **Database embedding** — `create_database` with `parentDocId` embeds the database inside a page
- **Document move** — `update_document` with `parentId` moves documents between parents
- **Workspace Map** — one-call ID reference for Project Instructions
- **Universal deployment** — pure HTTP, no `SIYUAN_WORKSPACE_PATH` needed

---

## License

MIT — see [LICENSE](LICENSE)
