# Roadmap — SiYuan MCP Server

Ideas and known limitations discovered through testing. Not committed to any timeline.

---

## Column type coverage

### État validé (2026-02-22)

Tests done on `DB-Test-UpdateRow`. All types added programmatically by writing the database JSON directly (`/data/storage/av/<id>.json`) since no HTTP endpoint was found to add columns at runtime.

| SiYuan type | API name | Read | Write | Notes |
|-------------|----------|------|-------|-------|
| Primary key | `block` | ✓ | name param in `av_create_row` | Auto-managed |
| Text | `text` | ✓ | ✓ | |
| Number | `number` | ✓ | ✓ | |
| Select | `select` → `mSelect` | ✓ | ✓ | SiYuan stores as mSelect internally |
| Multi-select | `mSelect` | ✓ | ✓ | |
| Date | `date` | ✓ | ✓ | content = Unix timestamp in ms |
| Checkbox | `checkbox` | ✓ | ✓ | |
| Link | `url` | ✓ | ✓ | |
| Email | `email` | ✓ | ✓ | |
| Phone | `phone` | ✓ | ✓ | |
| Assets | `mAsset` | ✓ | ✓ | content = asset path (must exist in workspace) |
| Template | `template` | ✓ | code 0 (read-only in practice) | SiYuan computes from template string |
| Relation | `relation` | ✓ | partial — needs blockIDs from related DB | See below |
| Rollup | `rollup` | ✓ partial | read-only (computed) | Value is in `v.rollup.content` |
| Line number | `lineNumber` | ✓ (createdAt) | read-only (auto) | |
| Created time | `createdTime` | ✓ (createdAt) | read-only (auto) | |
| Updated time | `updatedTime` | ✓ (updatedAt) | read-only (auto) | |

---

## Potential new tools

### High priority

#### `av_set_relation`
Write a relation between rows of two databases.
Currently blocked: `av_update_row` with `type: "relation"` returns code 0 but persists `blockIDs: null`.
Need to discover the correct API format for writing relation values.
Useful for: linking DB-Tasks rows to DB-Projects rows.

#### `av_get_select_options`
List existing select/mSelect options for a column (with their colors).
Prevents writing invalid option names.
API: `renderAttributeView` already returns column definitions with options — just expose it as a tool.

#### `doc_list`
List documents in a notebook without loading their content.
Currently `batch_read_all_documents` loads full content (heavy).
API: `POST /api/filetree/listDocsByPath` — lightweight, returns path + ID tree.

### Medium priority

#### `av_add_column`
Add a column to an existing database.
Blocked: no working HTTP endpoint found (`addAttributeViewKey` returns code 0 with no effect).
Workaround tested: directly write the `.json` file in `/data/storage/av/` — works but bypasses transaction system.
To investigate: SiYuan WebSocket transactions (`/api/transactions` with `addAttrViewKey` action).

#### `av_delete_column`
Remove a column from a database. Same blocker as `av_add_column`.

#### `av_create_database`
Create a new Attribute View database.
API unknown — needs investigation.

#### `av_rename_database`
Rename a database. Probably via direct JSON edit or unknown API endpoint.

#### `av_export_csv`
Export a database as CSV text. Can be implemented client-side using `av_render_database` output.
No new SiYuan API needed.

### Lower priority

#### Better `av_assets` write
Currently `mAsset` write accepts `{type, name, content}` objects where `content` is a workspace-relative path.
The asset file must already exist (uploaded via `assets.upload`).
A combined `av_set_asset` tool could: upload the file, then set the mAsset value in one call.

#### `av_relation_write` via `batchSetAttributeViewBlockAttrs`
The correct format for writing relations is unknown.
To investigate: capture what SiYuan sends when linking rows in the UI (browser DevTools → Network tab).

---

## Known limitations

- **`addAttributeViewKey` HTTP API**: Returns `{code: 0}` with no effect regardless of parameters tried. Direct JSON file modification works but is not transaction-safe.
- **Relation write**: `setAttributeViewBlockAttr` with `{relation: {blockIDs: [...]}}` returns code 0 but blockIDs don't persist. Format needs investigation.
- **`lineNumber`**: The actual displayed line number (1, 2, 3…) is not available in the API — only `createdAt` timestamp. The number displayed in SiYuan UI is computed client-side by row position.
- **`rollup`**: Computed from a relation column. Content returned by API may be raw data before aggregation.
- **SiYuan workspace path**: The `mAsset` content field is a workspace-relative path like `assets/filename.png`. Files must be uploaded first via `assets.upload`.
