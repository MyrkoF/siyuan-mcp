# SiYuan MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for [SiYuan Note](https://b3log.org/siyuan/), enabling AI assistants (Claude, Cursor, etc.) to read, write, and manage your SiYuan workspace — including full support for **Attribute View databases** (SiYuan's relational database system, similar to Notion databases).

---

## Features

### Attribute View Databases (unique to this fork)
SiYuan's Attribute View system lets you create relational databases inside your notes. This MCP server exposes full read/write access to them:

| Tool | Description |
|------|-------------|
| `av_list_databases` | List all Attribute View databases in the workspace (name, field count, entry count) |
| `av_render_database` | Read a full database: all fields (with types) and all entries (with parsed cell values) |
| `av_create_entry` | Create a new detached entry with an optional name and initial cell values |
| `av_delete_entry` | Delete one or more entries from a database by entry ID |
| `av_update_entry` | Update one or more cells in an entry in a single API call (batch) |
| `av_get_entry` | Fetch a single entry by ID (returns all its field values) |
| `av_bulk_create_entries` | Create multiple entries in one API round-trip |
| `av_bulk_update_entries` | Update multiple entries in one batch API call |
| `av_query_database` | Filter entries by field name/value (partial match, case-insensitive) |
| `av_create_database` | Create a new Attribute View database with a document in a notebook |
| `av_list_fields` | List all fields (name, type, options) of a database |
| `av_create_field` | Add a new field to an existing database (name, type, options) |
| `av_update_field` | Rename a field or update its options (e.g. add/remove select choices) |
| `av_delete_field` | Delete a field from a database (cannot delete the primary key field) |

**Supported field types (read/write):** `block` (primary key), `text`, `number`, `checkbox`, `select`, `mSelect`, `date`, `url`, `email`, `phone`, `mAsset`

**System/computed fields (read-only — value set by SiYuan):** `relation`, `rollup`, `created`, `updated`, `lineNumber`, `template`

### Documents
| Tool | Description |
|------|-------------|
| `doc_get` | Read a document's Markdown content and path by ID |
| `doc_rename` | Rename a document by ID |
| `doc_delete` | Send a document to the SiYuan trash. Refuses if children exist (use `cascade:true` to delete recursively). Use `dryRun:true` to preview what would be deleted without touching anything. |
| `doc_move` | Move one or more documents to a new parent document or notebook |

### Notebooks & Documents
| Tool | Description |
|------|-------------|
| `list_notebooks` | List all notebooks |
| `create_notebook` | Create a new notebook |
| `batch_read_all_documents` | Read the full content of all documents in a notebook (heavy — use for bulk export/indexing) |
| `batch_create_docs` | Create multiple documents in one call |

### Blocks
| Tool | Description |
|------|-------------|
| `blocks_get` | Get block content (kramdown) |
| `blocks_create` | Insert a new block |
| `blocks_update` | Update a block |
| `blocks_delete` | Delete a block |
| `blocks_move` | Move a block to a new position |
| `batch_create_blocks` | Batch create multiple blocks |
| `batch_update_blocks` | Batch update multiple blocks |
| `batch_delete_blocks` | Batch delete multiple blocks |

### Search
| Tool | Description |
|------|-------------|
| `search_content` | Full-text keyword search |
| `advanced_search` | Multi-criteria search (tags, date range, block type) |
| `quick_text_search` | Simplified text search with case/word options |
| `search_by_tags` | Search by one or multiple tags |
| `search_by_date_range` | Search by creation or modification date |
| `recursive_search_notes` | Deep recursive search with fuzzy matching |
| `batch_search_queries` | Run multiple search queries in one call |

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
| `assets_upload` | Upload a file to the workspace |
| `assets_list` | List assets attached to a document |
| `assets_unused` | Find unused asset files |
| `assets_missing` | Find missing asset files |
| `assets_rename` | Rename an asset |
| `assets_ocr` | OCR text recognition on an image |

### Context (multi-step task memory)
| Tool | Description |
|------|-------------|
| `context_session_create` | Create an in-memory session to store data across multi-step tasks |
| `context_session_get` | Read data from a session |
| `context_session_update` | Update data in a session |
| `context_reference_add` | Add a reference (block/doc ID) to a session |
| `context_reference_list` | List all references in a session |
| `context_merge` | Merge two sessions |
| `context_summary` | Get a summary of a session's content |

### MCP Prompts & Resources
| Tool | Description |
|------|-------------|
| `prompts_list` | List all available MCP prompt templates |
| `prompts_get` | Get a prompt template by name |
| `prompts_validate` | Validate a prompt template |
| `resources_discover` | Discover available MCP resources |
| `resources_search` | Search MCP resources by keyword |
| `resources_stats` | Get stats on MCP resource usage |

### System
| Tool | Description |
|------|-------------|
| `siyuan_workspace_map` | Generate a workspace map (notebook + database IDs) ready to paste into Project Instructions |
| `system_health` | Check SiYuan connection status |
| `system_discover_ports` | Auto-discover the SiYuan port |
| `system_cache_stats` | Show internal server cache statistics |
| `system_retry_stats` | Show HTTP retry statistics |

---

## Installation

### Prerequisites
- [SiYuan Note](https://b3log.org/siyuan/en/) installed and running
- Node.js 18+

### Get your API token
In SiYuan: **Settings → About → API token** → copy the token.

### Option 1 — npx (recommended, no install)

No clone, no build. Just add this to your `claude_desktop_config.json` and restart Claude Desktop:

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
If SiYuan runs on a non-default port or remote machine:

```json
{
  "mcpServers": {
    "siyuan": {
      "command": "npx",
      "args": ["-y", "siyuan-query-mcp@latest"],
      "env": {
        "SIYUAN_API_TOKEN": "your-token-here",
        "SIYUAN_API_URL": "http://192.168.1.100:6806"
      }
    }
  }
}

```
### Option 2 From source
```bash
git clone https://github.com/MyrkoF/siyuan-mcp.git
cd siyuan-mcp
npm install
npm run build
```

Then add this to your claude_desktop_config.json:

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
If SiYuan runs on a non-default port or remote machine:

```json
{
  "mcpServers": {
    "siyuan": {
      "command": "node",
      "args": ["/path/to/siyuan-mcp/dist/index.js"],
      "env": {
        "SIYUAN_API_TOKEN": "your-token-here",
        "SIYUAN_API_URL": "http://192.168.1.100:6806"
      }
    }
  }
}
```

---

## Supercharge the LLM: Workspace Map (recommended)

By default, the LLM discovers your workspace on-demand — calling `list_notebooks`, `av_list_databases`, etc. at the start of each task. **You can skip all of that** by generating a workspace map once and keeping it in memory.

### Step 1 — Generate the map

In your AI client (Claude Desktop, Cursor, etc.), ask:

```
Call siyuan_workspace_map
```

The tool returns a Markdown block with:
- All your notebooks and their first two levels of documents
- All Attribute View databases with their IDs
- A quick-reference table: which tool to call for each goal

### Step 2 — Store it in memory

**Option A — Claude Desktop Project Instructions (recommended, persistent)**

Paste the full output into your Claude Desktop project's **Project Instructions**. Claude will have your IDs available in every conversation without any discovery calls.

1. In Claude Desktop → open your project → **Project Instructions**
2. Paste the output from `siyuan_workspace_map`
3. Refresh whenever your workspace structure changes

**Option B — Start of chat (per session)**

Paste the MAP at the beginning of your conversation. Useful for one-off sessions or when Project Instructions are not available.

### Why this matters

Without the MAP, Claude needs extra tool calls to find your notebook and database IDs before it can do anything. With the MAP pre-loaded, Claude goes straight to the action:

| Without MAP | With MAP |
|-------------|---------|
| `list_notebooks` → find notebook ID | Already known from Project Instructions |
| `av_list_databases` → find DB ID | Already known from Project Instructions |
| `av_render_database` → read content | Called directly on first request |

### Example MAP output

```markdown
## SiYuan Workspace MAP

### IMPORTANT — Tool quick-reference (always use these, never SQL)
| Goal | Tool to call |
|------|-------------|
| Read database entries + field values | `av_render_database(avId)` |
| Filter database entries | `av_query_database(avId, field:"Status", value:"In Progress")` |
| List fields of a database | `av_list_fields(avId)` |
| Create multiple entries at once | `av_bulk_create_entries(avId, entries:[...])` |
| List documents in notebook | `docs_list(notebookId)` |
| Read document content | `doc_get(docId)` |
| Create document | `docs_create(notebookId, path:"/Name", title:"Name")` |
| Full workflow guide | read resource `siyuan://static/workflows` |

---

### Notebooks & Documents
- **PARA** `20251101-abc1234`
  - Projects `20251102-def5678`
  - Areas `20251103-ghi9012`
- **Divers** `20251104-jkl3456`
  - Archive `20251105-mno7890`

---

### Attribute View Databases
To read ANY database: call `av_render_database(avId)` — returns all entries + all field values.

- **DB-Projects** `20251215-op0w1p9` (6 fields, 12 entries)
  → `av_render_database('20251215-op0w1p9')`
- **DB-Tasks** `20251216-xyz7890` (4 fields, 38 entries)
  → `av_render_database('20251216-xyz7890')`
```

> **Tip:** The MAP also points to `siyuan://static/workflows` — a built-in MCP resource with validated step-by-step CRUD workflows. Claude can read it on demand for complex multi-step operations.

---

## Configuration

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SIYUAN_API_TOKEN` | **Yes** | Your SiYuan API token (from Settings → About) |
| `SIYUAN_API_URL` | No | SiYuan API base URL. If omitted, the server auto-discovers the port by scanning 6806–6808. |

**Legacy aliases** (still supported): `SIYUAN_TOKEN` → `SIYUAN_API_TOKEN`, `SIYUAN_BASE_URL` → `SIYUAN_API_URL`



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

## How Attribute View writes work

SiYuan uses two separate storage layers for Attribute View databases:

| Layer | Contains | Updated by |
|-------|----------|------------|
| Kernel in-memory model | Live database state | SiYuan's own APIs (`/api/av/…`) |
| JSON files (`/data/storage/av/*.json`) | Persisted database state | SiYuan (sync from kernel), or `/api/file/putFile` |

> **Key rule:** writing directly to the JSON file via `putFile` does **not** update SiYuan's kernel model. The GUI reads from the kernel, so file-only writes are invisible to the user and get overwritten during the next normalization pass. All entry and field operations must go through SiYuan's official API endpoints.

### API endpoints used per operation

| Operation | API endpoint |
|-----------|-------------|
| Create entry / bulk create | `/api/av/appendAttributeViewDetachedBlocksWithValues` |
| Update entries | `/api/av/batchSetAttributeViewBlockAttrs` |
| Delete entries | `/api/av/removeAttributeViewBlocks` |
| Add field | `/api/av/addAttributeViewKey` |
| Delete field | `/api/av/removeAttributeViewKey` |
| Read database | `/api/av/renderAttributeView` |
| **Create database** | `/api/file/putFile` + `createDocWithMd` + `insertBlock` (no HTTP API exists for DB creation) |

`av_create_database` is the only operation that still writes to the JSON file directly — because SiYuan has no endpoint for creating a new AV database. All other operations use the standard `/api/av/` endpoints. Everything is pure HTTP — no local filesystem access or `SIYUAN_WORKSPACE_PATH` required.

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
→ { name, fields: [{id, name, type}], entries: [{id, cells: {...}}] }
```

#### Create an entry with initial values
```
av_create_entry(
  avId: "20251215105701-op0w1p9",
  name: "New project",
  values: [
    { fieldId: "col-status-id", type: "select",   content: "Active" },
    { fieldId: "col-note-id",   type: "text",     content: "Created via MCP" },
    { fieldId: "col-done-id",   type: "checkbox", content: false }
  ]
)
→ the new entry with its ID and all cell values
```

#### Update multiple cells in one call
```
av_update_entry(
  avId:  "20251215105701-op0w1p9",
  entryId: "20251216093012-abc1234",
  updates: [
    { fieldId: "col-status-id",   type: "select", content: "Done" },
    { fieldId: "col-progress-id", type: "number", content: 100 },
    { fieldId: "col-note-id",     type: "text",   content: "Completed" }
  ]
)
→ { avId, entryId, updatedKeys: [...] }
```

> **Note on select fields:** SiYuan stores single-select values internally as `mSelect` (array). The `type: "select"` in `updates` is handled automatically — no need to use the raw `mSelect` format.

#### Filter entries
```
av_query_database(
  avId:   "20251215105701-op0w1p9",
  field: "Status",
  value:  "active"
)
→ entries where Status contains "active" (case-insensitive)
```

#### Delete entries
```
av_delete_entry(
  avId:   "20251215105701-op0w1p9",
  entryIds: ["row-id-1", "row-id-2"]
)
```

#### Create a new database
Creates a new Attribute View database and its host document in a notebook.

```
av_create_database(
  notebookId: "20251217123754-wo6vimv",
  name: "DB-Projects",
  fields: [
    { name: "Status",   type: "select" },
    { name: "Priority", type: "select" },
    { name: "Due",      type: "date" },
    { name: "Done",     type: "checkbox" },
    { name: "Notes",    type: "text" }
  ]
)
→ { avId, docId, name, notebookId }
```

The `avId` returned can immediately be used with all other `av_*` tools.
Fields of system types (`created`, `updated`, `lineNumber`, `rollup`, `relation`) can be declared but their values are managed by SiYuan — you cannot write to them manually.

> **Note:** `av_create_database` uses SiYuan's `/api/file/putFile` HTTP endpoint to write the database JSON. No local filesystem access or `SIYUAN_WORKSPACE_PATH` configuration required.

#### List fields
```
av_list_fields(avId: "20251215105701-op0w1p9")
→ [{ id, name: "Status", type: "select", options: [{ name: "In Progress" }, { name: "Done" }] }, ...]
```

#### Add a field
```
av_create_field(
  avId: "20251215105701-op0w1p9",
  name: "Priority",
  type: "select"
)
→ { id, name: "Priority", type: "select" }
```
System types (`relation`, `rollup`, `created`, `updated`, `lineNumber`, `template`) are rejected.
Select/mSelect options are auto-created when entry values are set via `av_update_entry` or `av_bulk_update_entries` — no need to define them upfront.

#### Rename a field
```
# Renaming is not supported via SiYuan's public API.
# av_update_field returns a clear error directing to the GUI:
av_update_field(avId: "...", fieldId: "col-id", changes: { name: "State" })
→ error: "Renaming fields is not supported via SiYuan's public API.
          To rename field 'Priority', use SiYuan's GUI: click the column header → rename."
```

#### Delete a field
```
av_delete_field(avId: "20251215105701-op0w1p9", fieldId: "col-id")
```
The primary key field (`block` type) cannot be deleted.

#### Fetch a single entry
```
av_get_entry(avId: "20251215105701-op0w1p9", entryId: "20251216093012-abc1234")
→ { id, cells: { Name: "My Project", Status: ["In Progress"], Priority: ["High"] } }
```

#### Create multiple entries at once
```
av_bulk_create_entries(
  avId: "20251215105701-op0w1p9",
  entries: [
    { name: "Project Alpha", values: [{ fieldId: "col-status", type: "select", content: "In Progress" }] },
    { name: "Project Beta" },
    { name: "Project Gamma", values: [{ fieldId: "col-status", type: "select", content: "Done" }] }
  ]
)
→ { createdCount: 3, entries: [...] }
```

#### Update multiple entries at once
```
av_bulk_update_entries(
  avId: "20251215105701-op0w1p9",
  updates: [
    { entryId: "row-id-1", changes: [{ fieldId: "col-status", type: "select", content: "Done" }] },
    { entryId: "row-id-2", changes: [{ fieldId: "col-priority", type: "select", content: "High" }] }
  ]
)
→ { updatedCount: 2, entryIds: ["row-id-1", "row-id-2"] }
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
→ error: "Deletion refused: document has 2 child(ren). Use cascade:true to delete recursively..."

# Preview what would be deleted (no changes made)
doc_delete(id: "20251216093012-abc1234", cascade: true, dryRun: true)
→ { id, deletedChildren: [{id, hPath}, ...], childCount: 2, dryRun: true }

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
**Field IDs (keyIDs):** returned by `av_render_database` in the `columns` array.
**Document IDs:** use `search_content`, `docs_list`, or right-click a document in SiYuan → **Copy block ID**.
**Notebook IDs:** use `list_notebooks`.

> **Shortcut:** run `siyuan_workspace_map` to get all notebook and database IDs in one call, formatted as a Markdown block ready to paste into Claude Desktop Project Instructions.

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
- **Database creation** — `av_create_database` creates databases programmatically with typed fields
- **Document CRUD** — get, rename, delete (with cascade protection), move
- **Batch cell update** — update multiple database cells in a single API call
- **Full field type coverage** — all 16 SiYuan field types parsed; 11 writable + 5 system/computed
- **Workspace Map** — `siyuan_workspace_map` generates a ready-to-paste ID reference for Claude Desktop Project Instructions
- **Universal deployment** — all operations use SiYuan's HTTP API; no local filesystem access or `SIYUAN_WORKSPACE_PATH` required; works with remote SiYuan instances
- Auto-discovery of SiYuan port
- Unified environment variable handling (`SIYUAN_API_TOKEN`, `SIYUAN_API_URL`)

---

## License

MIT — see [LICENSE](LICENSE)
