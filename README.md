# SiYuan MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for [SiYuan Note](https://b3log.org/siyuan/), enabling AI assistants (Claude, Cursor, etc.) to read, write, and manage your SiYuan workspace — including full support for **Attribute View databases** (SiYuan's relational database system, similar to Notion databases).

---

## Features

### Attribute View Databases (unique to this fork)
SiYuan's Attribute View system lets you create relational databases inside your notes. This MCP server exposes full read/write access to them:

| Tool | Description |
|------|-------------|
| `av_list_databases` | List all Attribute View databases in the workspace (name, column count, row count) |
| `av_render_database` | Read a full database: all columns (with types) and all rows (with parsed cell values) |
| `av_create_row` | Create a new detached row with an optional name and initial cell values |
| `av_delete_row` | Delete one or more rows from a database by row ID |
| `av_update_row` | Update one or more cells in a row in a single API call (batch) |
| `av_query_database` | Filter rows by column name/value (partial match, case-insensitive) |

**Supported column types:** `block` (primary key), `text`, `number`, `checkbox`, `select`, `mSelect`, `date`, `url`, `email`, `phone`, `relation`, `rollup`

### Documents
| Tool | Description |
|------|-------------|
| `doc_get` | Read a document's Markdown content and path by ID |
| `doc_rename` | Rename a document by ID |
| `doc_delete` | Send a document to the SiYuan trash. Refuses if children exist (use `cascade:true` to delete recursively) |
| `doc_move` | Move one or more documents to a new parent document or notebook |

### Notebooks & Documents (legacy)
| Tool | Description |
|------|-------------|
| `list_notebooks` | List all notebooks |
| `create_notebook` | Create a new notebook |
| `create_document` | Create a document with Markdown content |
| `create_subdocument` | Create a child document under a parent path |
| `batch_read_all_documents` | Batch-read all documents in a notebook |

### Blocks
| Tool | Description |
|------|-------------|
| `blocks.get` | Get block content (kramdown) |
| `blocks.create` | Insert a new block |
| `blocks.update` | Update a block |
| `blocks.delete` | Delete a block |
| `blocks.move` | Move a block to a new position |
| `batch_create_blocks` | Batch create multiple blocks |
| `batch_update_blocks` | Batch update multiple blocks |
| `batch_delete_blocks` | Batch delete multiple blocks |

### Search
| Tool | Description |
|------|-------------|
| `search_content` / `notes.search` | Full-text keyword search |
| `advanced_search` | Multi-criteria search (tags, date range, block type) |
| `quick_text_search` | Simplified text search with case/word options |
| `search_by_tags` | Search by one or multiple tags |
| `search_by_date_range` | Search by creation or modification date |
| `recursive_search_notes` | Deep recursive search with fuzzy matching |

### Tags
| Tool | Description |
|------|-------------|
| `get_all_tags` | List all tags with usage stats |
| `search_tags` | Search tags by keyword |
| `get_block_tags` | Get tags on a specific block |
| `manage_block_tags` | Add, remove, or replace tags on a block |

### References & Links
| Tool | Description |
|------|-------------|
| `get_block_references` | Get full reference graph for a block |
| `get_backlinks` | Get backlinks (incoming references) |
| `create_reference` | Create a link between two blocks |

### Assets
| Tool | Description |
|------|-------------|
| `assets.upload` | Upload a file to the workspace |
| `assets.list` | List assets attached to a document |
| `assets.unused` | Find unused asset files |
| `assets.missing` | Find missing asset files |
| `assets.rename` | Rename an asset |
| `assets.ocr` | OCR text recognition on an image |

### System
| Tool | Description |
|------|-------------|
| `system.health` | Check SiYuan connection status |
| `system.discover-ports` | Auto-discover the SiYuan port |

---

## Installation

### Prerequisites
- [SiYuan Note](https://b3log.org/siyuan/en/) installed and running
- Node.js 18+

### Get your API token
In SiYuan: **Settings → About → API token** → copy the token.

### From source
```bash
git clone https://github.com/MyrkoF/siyuan-mcp.git
cd siyuan-mcp
npm install
npm run build
```

---

## Configuration

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SIYUAN_API_TOKEN` | **Yes** | Your SiYuan API token (from Settings → About) |
| `SIYUAN_API_URL` | No | SiYuan API base URL. If omitted, the server auto-discovers the port by scanning 6806–6808. |

**Legacy aliases** (still supported): `SIYUAN_TOKEN` → `SIYUAN_API_TOKEN`, `SIYUAN_BASE_URL` → `SIYUAN_API_URL`

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "siyuan": {
      "command": "node",
      "args": ["/path/to/siyuan-mcp/dist/index.js"],
      "env": {
        "SIYUAN_API_TOKEN": "your-token-here"
      }
    }
  }
}
```

If SiYuan runs on a non-default port or on a remote machine:

```json
{
  "mcpServers": {
    "siyuan": {
      "command": "node",
      "args": ["/path/to/siyuan-mcp/dist/index.js"],
      "env": {
        "SIYUAN_API_TOKEN": "your-token-here",
        "SIYUAN_API_URL": "http://127.0.0.1:6806"
      }
    }
  }
}
```

### Docker / remote SiYuan

If SiYuan runs in Docker or on a server, point `SIYUAN_API_URL` to the host:

```json
"env": {
  "SIYUAN_API_TOKEN": "your-token-here",
  "SIYUAN_API_URL": "http://192.168.1.100:6806"
}
```

### Port auto-discovery

When `SIYUAN_API_URL` is not set, the server automatically scans ports 6806, 6807, and 6808 to find a running SiYuan instance. This is useful when SiYuan's port changes between restarts.

---

## Usage examples

### Attribute View databases

#### List all databases
```
av_list_databases()
→ [{id, name, columnCount, rowCount}, ...]
```

#### Read a database
```
av_render_database(id: "20251215105701-op0w1p9")
→ { name, columns: [{id, name, type}], rows: [{id, cells: {...}}] }
```

#### Create a row with initial values
```
av_create_row(
  avId: "20251215105701-op0w1p9",
  name: "New project",
  values: [
    { keyId: "col-status-id", type: "select",   content: "Active" },
    { keyId: "col-note-id",   type: "text",     content: "Created via MCP" },
    { keyId: "col-done-id",   type: "checkbox", content: false }
  ]
)
→ the new row with its ID and all cell values
```

#### Update multiple cells in one call
```
av_update_row(
  avId:  "20251215105701-op0w1p9",
  rowId: "20251216093012-abc1234",
  updates: [
    { keyId: "col-status-id",   type: "select", content: "Done" },
    { keyId: "col-progress-id", type: "number", content: 100 },
    { keyId: "col-note-id",     type: "text",   content: "Completed" }
  ]
)
→ { avId, rowId, updatedKeys: [...] }
```

> **Note on select columns:** SiYuan stores single-select values internally as `mSelect` (array). The `type: "select"` in `updates` is handled automatically — no need to use the raw `mSelect` format.

#### Filter rows
```
av_query_database(
  avId:   "20251215105701-op0w1p9",
  column: "Status",
  value:  "active"
)
→ rows where Status contains "active" (case-insensitive)
```

#### Delete rows
```
av_delete_row(
  avId:   "20251215105701-op0w1p9",
  rowIds: ["row-id-1", "row-id-2"]
)
```

---

### Documents

#### Read a document
```
doc_get(id: "20251216093012-abc1234")
→ { id, hPath: "/My Notebook/My Doc", content: "# Title\n..." }
```

#### Rename a document
```
doc_rename(id: "20251216093012-abc1234", title: "New Title")
```

#### Delete a document (safe — goes to SiYuan trash)
```
# Safe: refuses if children exist
doc_delete(id: "20251216093012-abc1234")
→ error: "Suppression refusée : le document a 2 enfant(s). ..."

# Recursive: deletes all children depth-first, then parent
doc_delete(id: "20251216093012-abc1234", cascade: true)
→ { id, deletedChildren: [{id, hPath}, ...], childCount: 2 }
```

#### Move a document
```
# Move one doc into another doc (becomes child)
doc_move(fromIds: ["doc-id"], toId: "parent-doc-id")

# Move to notebook root
doc_move(fromIds: ["doc-id"], toId: "notebook-id")

# Move multiple docs at once
doc_move(fromIds: ["doc-1", "doc-2"], toId: "target-id")
```

---

## How to find IDs

**Database IDs:** use `av_list_databases` — returns all database IDs and names.
**Column IDs (keyIDs):** returned by `av_render_database` in the `columns` array.
**Document IDs:** use `search_content`, `docs.list`, or right-click a document in SiYuan → **Copy block ID**.
**Notebook IDs:** use `list_notebooks`.

---

## Development

```bash
# Install dependencies
npm install

# Build TypeScript → dist/
npm run build

# Type-check without building
npx tsc --noEmit
```

---

## Attribution

This project is a fork of [GALIAIS/siyuan-mcp-server](https://github.com/GALIAIS/siyuan-mcp-server).

The original project provided the foundational MCP server structure for SiYuan (notebooks, documents, blocks, search, assets, tags). This fork adds:

- **Full Attribute View (database) support** — the main feature missing from all existing SiYuan MCP servers
- **Document CRUD** — get, rename, delete (with cascade protection), move
- **Batch cell update** — update multiple database cells in a single API call
- Universal deployment design (no hardcoded workspace structure)
- Auto-discovery of SiYuan port
- Unified environment variable handling (`SIYUAN_API_TOKEN`, `SIYUAN_API_URL`)

---

## License

MIT — see [LICENSE](LICENSE)
