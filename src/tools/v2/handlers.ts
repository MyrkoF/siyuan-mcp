/**
 * v2 Tool Handlers — 17 tools
 *
 * Single dispatch function + one handler per tool.
 * Services reused from v1: AttributeViewService, DocService.
 * Client layer (siyuanClient) untouched.
 */

import { createSiyuanClient } from '../../siyuanClient/index.js';
import type { SiyuanClient } from '../../siyuanClient/index.js';
import { AttributeViewService } from '../../services/av-service.js';
import { DocService } from '../../services/doc-service.js';
import { createStandardResponse, StandardResponse } from './response.js';

// ── Singletons ──────────────────────────────────────────────────────────────

const client: SiyuanClient = createSiyuanClient({ autoDiscoverPort: true });
const avService = new AttributeViewService(client);
const docService = new DocService(client);

// ── Main dispatch ───────────────────────────────────────────────────────────

export async function handleToolCall(name: string, args: any): Promise<StandardResponse> {
  switch (name) {
    // READ
    case 'siyuan_sql':
      return handleSiyuanSql(args);
    case 'read_database':
      return handleReadDatabase(args);

    // ORIENTATION
    case 'workspace_map':
      return handleWorkspaceMap();
    case 'list_notebooks':
      return handleListNotebooks(args);

    // DOCUMENTS
    case 'create_document':
      return handleCreateDocument(args);
    case 'update_document':
      return handleUpdateDocument(args);
    case 'delete_document':
      return handleDeleteDocument(args);

    // BLOCKS
    case 'insert_block':
      return handleInsertBlock(args);
    case 'update_block':
      return handleUpdateBlock(args);
    case 'batch_block_ops':
      return handleBatchBlockOps(args);

    // ATTRIBUTE VIEW
    case 'create_database':
      return handleCreateDatabase(args);
    case 'write_db_rows':
      return handleWriteDbRows(args);
    case 'update_db_cells':
      return handleUpdateDbCells(args);
    case 'delete_db_rows':
      return handleDeleteDbRows(args);
    case 'manage_db_fields':
      return handleManageDbFields(args);

    // MISC
    case 'set_block_attrs':
      return handleSetBlockAttrs(args);
    case 'upload_asset':
      return handleUploadAsset(args);

    default:
      return createStandardResponse(false, `Unknown tool: ${name}`, null, `Tool "${name}" is not available`);
  }
}

// ── Handlers ────────────────────────────────────────────────────────────────

async function handleSiyuanSql(args: any): Promise<StandardResponse> {
  if (!args.stmt?.trim()) {
    return createStandardResponse(false, 'SQL statement required', null, 'stmt parameter is empty');
  }
  const response = await client.request('/api/query/sql', { stmt: args.stmt });
  if (!response || response.code !== 0) {
    return createStandardResponse(false, 'SQL query failed', null, response?.msg ?? 'Unknown error');
  }
  const rows = response.data ?? [];
  return createStandardResponse(true, `${rows.length} row(s) returned`, rows);
}

async function handleReadDatabase(args: any): Promise<StandardResponse> {
  // Mode: list all databases
  if (args.mode === 'list') {
    const dbs = await avService.listDatabases();
    return createStandardResponse(true, `${dbs.length} database(s) found`, dbs);
  }

  if (!args.id?.trim()) {
    return createStandardResponse(false, 'Database ID required', null, 'Provide id, or use mode:"list"');
  }

  // Single entry by ID
  if (args.entryId?.trim()) {
    const entry = await avService.getEntry(args.id, args.entryId);
    if (!entry) {
      return createStandardResponse(false, 'Entry not found', null, `No entry with ID "${args.entryId}"`);
    }
    return createStandardResponse(true, 'Entry retrieved', entry);
  }

  // Filter by field value
  if (args.filter?.field && args.filter?.value) {
    const db = await avService.queryDatabase(args.id, args.filter.field, args.filter.value);
    return createStandardResponse(true, `${db.total} matching entries`, db);
  }

  // Full database render (default)
  const db = await avService.renderDatabase(args.id);
  return createStandardResponse(true, `Database "${db.name}" — ${db.total} entries, ${db.fields.length} fields`, db);
}

async function handleWorkspaceMap(): Promise<StandardResponse> {
  const nbResp = await client.request('/api/notebook/lsNotebooks');
  const notebooks = (nbResp?.data?.notebooks || nbResp?.notebooks || []) as any[];
  const databases = await avService.listDatabases() as any[];

  const lines: string[] = [
    '## SiYuan Workspace Map',
    '',
    '### Tool quick-reference',
    '| Goal | Tool |',
    '|------|------|',
    '| Read/search blocks, docs, tags | `siyuan_sql` (SQL SELECT) |',
    '| Read database entries + fields | `read_database(id)` |',
    '| Filter database entries | `read_database(id, filter:{field, value})` |',
    '| Create document | `create_document(notebook, path, title)` |',
    '| SQL schema + examples | read resource `siyuan://static/sql-schema` |',
    '| Full workflow guide | read resource `siyuan://static/workflows` |',
    '',
    '---',
    '',
  ];

  // Notebooks + 2 levels of documents
  lines.push('### Notebooks & Documents');
  for (const nb of notebooks) {
    lines.push(`\n#### ${nb.name} \`${nb.id}\``);
    try {
      const l1Resp = await client.documents.listDocs(nb.id, '/');
      const l1Docs = (l1Resp?.data?.files || l1Resp?.files || []) as any[];
      for (const doc of l1Docs) {
        lines.push(`- ${doc.name} \`${doc.id}\``);
        try {
          const l2Resp = await client.documents.listDocs(nb.id, doc.path);
          const l2Docs = (l2Resp?.data?.files || l2Resp?.files || []) as any[];
          for (const child of l2Docs) {
            lines.push(`  - ${child.name} \`${child.id}\``);
          }
        } catch { /* skip inaccessible children */ }
      }
    } catch { lines.push('  (could not list documents)'); }
  }

  // AV Databases
  lines.push('\n---', '\n### Attribute View Databases');
  lines.push('To read ANY database: call `read_database(id)` — returns all entries + all field values.\n');
  for (const db of databases) {
    lines.push(`- **${db.name}** \`${db.id}\` (${db.fieldCount} fields, ${db.entryCount} entries)`);
    lines.push(`  → \`read_database('${db.id}')\``);
  }

  return createStandardResponse(true, 'Workspace map generated', { map: lines.join('\n') });
}

async function handleListNotebooks(args: any): Promise<StandardResponse> {
  // Create mode
  if (args.name?.trim()) {
    const resp = await client.request('/api/notebook/createNotebook', {
      name: args.name.trim(),
      icon: args.icon || '📔'
    });
    if (!resp || resp.code !== 0) {
      return createStandardResponse(false, 'Failed to create notebook', null, resp?.msg ?? 'Unknown error');
    }
    return createStandardResponse(true, `Notebook "${args.name}" created`, resp.data);
  }

  // List mode (default)
  const resp = await client.request('/api/notebook/lsNotebooks');
  const notebooks = resp?.data?.notebooks || resp?.notebooks || [];
  return createStandardResponse(true, `${notebooks.length} notebook(s)`, notebooks);
}

async function handleCreateDocument(args: any): Promise<StandardResponse> {
  const result = await client.documents.createDoc(
    args.notebook,
    args.path,
    args.title,
    args.content || ''
  );
  return createStandardResponse(true, 'Document created', result);
}

async function handleUpdateDocument(args: any): Promise<StandardResponse> {
  if (!args.id?.trim()) {
    return createStandardResponse(false, 'Document ID required', null, 'id parameter is missing');
  }
  if (!args.title && !args.content && !args.parentId) {
    return createStandardResponse(false, 'Nothing to update', null, 'Provide title, content, and/or parentId');
  }

  const results: any = { id: args.id };

  if (args.title?.trim()) {
    await docService.renameDocument(args.id, args.title.trim());
    results.renamed = args.title.trim();
  }

  if (args.content !== undefined) {
    await client.blocks.updateBlock(args.id, args.content);
    results.contentUpdated = true;
  }

  if (args.parentId?.trim()) {
    await docService.moveDocuments([args.id], args.parentId.trim());
    results.movedTo = args.parentId.trim();
  }

  return createStandardResponse(true, 'Document updated', results);
}

async function handleDeleteDocument(args: any): Promise<StandardResponse> {
  const result = await docService.deleteDocument(args.id, args.cascade ?? false, args.dryRun ?? false);
  const msg = args.dryRun ? 'Dry run complete (no deletion)' : 'Document deleted';
  return createStandardResponse(true, msg, result);
}

async function handleInsertBlock(args: any): Promise<StandardResponse> {
  const result = await client.blocks.insertBlock(args.content, args.parentID, args.previousID);
  return createStandardResponse(true, 'Block inserted', result);
}

async function handleUpdateBlock(args: any): Promise<StandardResponse> {
  const result = await client.blocks.updateBlock(args.id, args.content);
  return createStandardResponse(true, 'Block updated', result);
}

async function handleBatchBlockOps(args: any): Promise<StandardResponse> {
  if (!args.operations?.length) {
    return createStandardResponse(false, 'No operations provided', null, 'operations array is empty');
  }

  const results = { success: [] as any[], failed: [] as any[] };

  for (const op of args.operations) {
    try {
      switch (op.action) {
        case 'insert': {
          const res = await client.blocks.insertBlock(op.content, op.parentID, op.previousID);
          results.success.push({ action: 'insert', result: res });
          break;
        }
        case 'update': {
          const res = await client.blocks.updateBlock(op.id, op.content);
          results.success.push({ action: 'update', id: op.id, result: res });
          break;
        }
        case 'delete': {
          const res = await client.blocks.deleteBlock(op.id);
          results.success.push({ action: 'delete', id: op.id, result: res });
          break;
        }
        default:
          results.failed.push({ action: op.action, error: `Unknown action: ${op.action}` });
      }
    } catch (err: any) {
      results.failed.push({ action: op.action, id: op.id, error: err.message });
    }
  }

  return createStandardResponse(
    true,
    `${results.success.length} succeeded, ${results.failed.length} failed`,
    results
  );
}

async function handleCreateDatabase(args: any): Promise<StandardResponse> {
  const result = await avService.createDatabase(args.notebookId, args.name, args.fields || [], args.parentDocId);
  return createStandardResponse(true, `Database "${result.name}" created`, result);
}

async function handleWriteDbRows(args: any): Promise<StandardResponse> {
  if (!args.rows?.length) {
    return createStandardResponse(false, 'No rows provided', null, 'rows array is empty');
  }

  // Map rows to the format expected by bulkCreateEntries
  const entries = args.rows.map((row: any) => ({
    name: row.name ?? '',
    values: row.values ?? []
  }));

  const created = await avService.bulkCreateEntries(args.avId, entries);
  return createStandardResponse(true, `${created.length} row(s) created`, {
    createdCount: created.length,
    entries: created
  });
}

async function handleUpdateDbCells(args: any): Promise<StandardResponse> {
  if (!args.updates?.length) {
    return createStandardResponse(false, 'No updates provided', null, 'updates array is empty');
  }

  const result = await avService.bulkUpdateEntries(args.avId, args.updates);
  return createStandardResponse(true, `${result.updatedCount} entries updated`, result);
}

async function handleDeleteDbRows(args: any): Promise<StandardResponse> {
  if (!args.entryIds?.length) {
    return createStandardResponse(false, 'No entry IDs provided', null, 'entryIds array is empty');
  }

  await avService.deleteRows(args.avId, args.entryIds);
  return createStandardResponse(true, `${args.entryIds.length} row(s) deleted`, {
    deletedCount: args.entryIds.length,
    entryIds: args.entryIds
  });
}

async function handleManageDbFields(args: any): Promise<StandardResponse> {
  if (!args.avId?.trim()) {
    return createStandardResponse(false, 'Database ID required', null, 'avId is missing');
  }

  switch (args.action) {
    case 'add': {
      if (!args.name?.trim() || !args.type?.trim()) {
        return createStandardResponse(false, 'name and type required for add', null, 'Provide name and type');
      }
      const field = await avService.createField(args.avId, args.name, args.type);
      return createStandardResponse(true, `Field "${field.name}" added`, field);
    }
    case 'remove': {
      if (!args.fieldId?.trim()) {
        return createStandardResponse(false, 'fieldId required for remove', null, 'Provide fieldId');
      }
      await avService.deleteField(args.avId, args.fieldId);
      return createStandardResponse(true, 'Field removed', { fieldId: args.fieldId });
    }
    default:
      return createStandardResponse(
        false,
        'Invalid action',
        null,
        `Action "${args.action}" not supported. Use "add" or "remove". Renaming is not supported by SiYuan API — use the GUI.`
      );
  }
}

async function handleSetBlockAttrs(args: any): Promise<StandardResponse> {
  if (!args.id?.trim()) {
    return createStandardResponse(false, 'Block ID required', null, 'id is missing');
  }
  if (!args.attrs || typeof args.attrs !== 'object') {
    return createStandardResponse(false, 'attrs required', null, 'Provide an object of key-value pairs');
  }

  const resp = await client.request('/api/attr/setBlockAttrs', { id: args.id, attrs: args.attrs });
  if (!resp || resp.code !== 0) {
    return createStandardResponse(false, 'Failed to set attributes', null, resp?.msg ?? 'Unknown error');
  }
  return createStandardResponse(true, 'Attributes set', { id: args.id, attrs: args.attrs });
}

async function handleUploadAsset(args: any): Promise<StandardResponse> {
  if (!args.name?.trim() || !args.data?.trim()) {
    return createStandardResponse(false, 'name and data required', null, 'Provide filename and base64 data');
  }

  const buf = Buffer.from(args.data, 'base64');
  const result = await client.assets.uploadAsset(buf, args.name, args.assetsDirPath);
  return createStandardResponse(true, 'Asset uploaded', result);
}
