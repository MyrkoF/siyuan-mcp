/**
 * Attribute View (Database) Service
 * Support complet pour les bases de données SiYuan (/api/av/renderAttributeView)
 *
 * Règles CLAUDE.md :
 * - Jamais hardcoder des IDs → env vars ou auto-discovery par nom
 * - Jamais SQL pour les colonnes custom → API uniquement
 * - Toujours identifier les colonnes par nom avec findColumn()
 * - Toujours try/catch sur renderAttributeView
 *
 */

import { SiyuanClient } from '../siyuanClient';
import { parseColumns, parseRow, findColumn } from '../utils/avParser';

// ==================== Types publics ====================

export interface AVColumn {
  id: string;
  name: string;
  type: string;
}

export interface AVField {
  id: string;
  name: string;
  type: string;
  options?: any[];
}

export interface AVRow {
  id: string;
  cells: Record<string, any>;
}

export interface AVDatabase {
  id: string;
  name: string;
  viewId?: string;
  viewType?: string;
  fields: AVColumn[];
  entries: AVRow[];
  total: number;
}

export interface AVDatabaseSummary {
  id: string;
  name: string;
  fieldCount: number;
  entryCount: number;
}

/**
 * Valeur initiale pour av_create_row.
 * content : string | number | boolean | string[] selon le type.
 */
export interface AVCreateRowValue {
  fieldId: string;
  type: string;
  content: any;
}

export interface AVColumnSpec {
  name: string;
  type: string;
}

export interface AVCreateDatabaseResult {
  avId: string;
  docId: string;
  name: string;
  notebookId: string;
  embeddedInParent: boolean;
}

// ==================== Service ====================

export class AttributeViewService {
  private client: SiyuanClient;

  constructor(client: SiyuanClient) {
    this.client = client;
  }

  // ==================== API publique ====================

  /**
   * Liste toutes les databases disponibles.
   * Utilise /api/file/readDir sur /data/storage/av puis renderAttributeView.
   * @param nameFilter — Filtre par préfixe de nom (ex: "DB-"), insensible à la casse
   */
  async listDatabases(nameFilter?: string): Promise<AVDatabaseSummary[]> {
    // Lister les fichiers .json dans /data/storage/av
    const dirResponse = await this.client.request('/api/file/readDir', {
      path: '/data/storage/av'
    });

    if (!dirResponse || dirResponse.code !== 0) {
      throw new Error(`Cannot list /data/storage/av: ${dirResponse?.msg ?? 'unknown error'}`);
    }

    const files: any[] = dirResponse.data ?? [];
    const avIds: string[] = files
      .filter((f: any) => !f.isDir && f.name?.endsWith('.json'))
      .map((f: any) => f.name.replace(/\.json$/, ''));

    // Rendre chaque database et récupérer nom + counts
    const summaries: AVDatabaseSummary[] = [];

    for (const id of avIds) {
      try {
        const db = await this.renderDatabase(id);
        const name = db.name || id;

        if (nameFilter && !name.toLowerCase().startsWith(nameFilter.toLowerCase())) {
          continue;
        }

        summaries.push({
          id,
          name,
          fieldCount: db.fields.length,
          entryCount: db.entries.length
        });
      } catch {
        // Database en trash ou corrompue → ignorer silencieusement
      }
    }

    return summaries;
  }

  /**
   * Rend une database complète (colonnes + toutes les lignes).
   * @param id — Block ID de la database (REQUIS)
   */
  async renderDatabase(id: string): Promise<AVDatabase> {
    if (!id || id.trim() === '') {
      throw new Error('Database ID is required');
    }

    const response = await this.client.request('/api/av/renderAttributeView', {
      id: id.trim()
    });

    if (!response || response.code !== 0) {
      throw new Error(
        `renderAttributeView failed for "${id}": ${response?.msg ?? 'unknown error'}`
      );
    }

    return this.parseRawResponse(id, response.data);
  }

  /**
   * Supprime une ou plusieurs lignes d'une database via
   * /api/av/removeAttributeViewBlocks.
   *
   * @param avId     — Block ID de la database
   * @param rowIds   — IDs des lignes à supprimer (au moins 1)
   */
  async deleteRows(avId: string, entryIds: string[]): Promise<void> {
    if (!avId || avId.trim() === '') {
      throw new Error('avId is required');
    }
    if (!entryIds || entryIds.length === 0) {
      throw new Error('At least one entryId is required');
    }

    const response = await this.client.request('/api/av/removeAttributeViewBlocks', {
      avID: avId.trim(),
      srcIDs: entryIds
    });

    if (!response || response.code !== 0) {
      throw new Error(
        `Deletion failed: ${response?.msg ?? 'unknown error'}`
      );
    }
  }

  /**
   * Met à jour plusieurs cellules d'une ligne en un seul appel via
   * /api/av/batchSetAttributeViewBlockAttrs.
   *
   * @param avId    — Block ID de la database
   * @param rowId   — ID de la ligne à modifier
   * @param updates — Tableau de valeurs à appliquer ({keyId, type, content})
   */
  async batchUpdateRow(
    avId: string,
    entryId: string,
    updates: AVCreateRowValue[]
  ): Promise<void> {
    if (!avId || !entryId) {
      throw new Error('avId and entryId are required');
    }
    if (!updates || updates.length === 0) {
      throw new Error('At least one update is required');
    }

    const values = updates.map(u => ({
      keyID: u.fieldId,
      rowID: entryId,
      value: this.buildUpdateValue(u)
    }));

    const response = await this.client.request('/api/av/batchSetAttributeViewBlockAttrs', {
      avID: avId,
      values
    });

    if (!response || response.code !== 0) {
      throw new Error(`Batch update failed: ${response?.msg ?? 'unknown error'}`);
    }
  }

  /**
   * Met à jour la valeur d'une cellule via /api/av/setAttributeViewBlockAttr.
   * Utilisé en interne (createRow) pour les cas où batchUpdate n'est pas adapté.
   */
  async updateRow(
    avId: string,
    entryId: string,
    fieldId: string,
    value: any
  ): Promise<any> {
    if (!avId || !entryId || !fieldId) {
      throw new Error('avId, entryId and fieldId are all required');
    }

    const response = await this.client.request('/api/av/setAttributeViewBlockAttr', {
      avID: avId,
      keyID: fieldId,
      rowID: entryId,
      value
    });

    if (!response || response.code !== 0) {
      throw new Error(`Update failed: ${response?.msg ?? 'unknown error'}`);
    }

    return response.data ?? { avId, entryId, fieldId };
  }

  /**
   * Create a new detached entry in the database via
   * /api/av/appendAttributeViewDetachedBlocksWithValues.
   *
   * Uses SiYuan's official API (2D array format) so the entry is registered
   * in the kernel's internal model — persists through normalizations and
   * shows in the GUI immediately.
   *
   * @param avId   — Block ID of the database
   * @param name   — Primary field content (entry title)
   * @param values — Optional initial cell values
   * @returns The new AVRow, or null if not found in re-render
   */
  async createEntry(
    avId: string,
    name: string = '',
    values: AVCreateRowValue[] = []
  ): Promise<AVRow | null> {
    if (!avId?.trim()) throw new Error('avId is required');

    // Get current entries to identify the new one after creation
    const before = await this.renderDatabase(avId);
    const beforeIds = new Set(before.entries.map((r: AVRow) => r.id));
    const pkField = before.fields.find((f: AVColumn) => f.type === 'block');
    if (!pkField) throw new Error('Primary field (block type) not found in this database');

    // Build the 2D cell array for this single row
    const row = this.buildAppendRow(pkField.id, name, values, before.fields);

    const response = await this.client.request('/api/av/appendAttributeViewDetachedBlocksWithValues', {
      avID: avId.trim(),
      blocksValues: [row]
    });

    if (!response || response.code !== 0) {
      throw new Error(`Failed to create entry: ${response?.msg ?? 'unknown error'}`);
    }

    // Re-render to get the new entry with its kernel-assigned ID
    const after = await this.renderDatabase(avId);
    return after.entries.find((r: AVRow) => !beforeIds.has(r.id)) ?? null;
  }

  /**
   * Filtre les entrées d'une database par colonne/valeur (recherche partielle,
   * insensible à la casse).
   */
  async queryDatabase(
    avId: string,
    field: string,
    value: string
  ): Promise<AVDatabase> {
    const db = await this.renderDatabase(avId);

    const targetCol = findColumn(db.fields, field);
    if (!targetCol) {
      throw new Error(
        `Field "${field}" not found. Available: ${db.fields.map(c => c.name).join(', ')}`
      );
    }

    const lowerValue = value.toLowerCase();

    const filteredEntries = db.entries.filter(entry => {
      const cellVal = entry.cells[targetCol.id];
      if (cellVal === null || cellVal === undefined) return false;

      if (Array.isArray(cellVal)) {
        return cellVal.some(v => String(v).toLowerCase().includes(lowerValue));
      }
      if (typeof cellVal === 'object') {
        const contents: any[] = cellVal.contents ?? [];
        if (contents.length > 0) {
          return contents.some((c: any) =>
            String(c?.content ?? c).toLowerCase().includes(lowerValue)
          );
        }
        return JSON.stringify(cellVal).toLowerCase().includes(lowerValue);
      }
      return String(cellVal).toLowerCase().includes(lowerValue);
    });

    return { ...db, entries: filteredEntries, total: filteredEntries.length };
  }

  /**
   * Crée une nouvelle database Attribute View dans un document SiYuan.
   *
   * Stratégie (aucun endpoint HTTP disponible pour créer une AV) :
   * 1. Générer les IDs SiYuan (avID, viewID, primaryKeyID)
   * 2. Écrire le fichier JSON dans /data/storage/av/<avID>.json via filesystem
   * 3. Créer un document dans le notebook cible
   * 4. Insérer un bloc AV dans le document via /api/block/insertBlock
   *
   * @param notebookId  — ID du notebook cible (requis)
   * @param name        — Nom de la database ET du document créé
   * @param columns     — Colonnes supplémentaires optionnelles [{name, type}]
   */
  async createDatabase(
    notebookId: string,
    name: string,
    columns: AVColumnSpec[] = [],
    parentDocId?: string
  ): Promise<AVCreateDatabaseResult> {
    if (!notebookId?.trim()) throw new Error('notebookId is required');
    if (!name?.trim())       throw new Error('name is required');

    const dbName    = name.trim();
    const avId      = this.generateSiyuanId();
    const viewId    = this.generateSiyuanId();
    const primaryId = this.generateSiyuanId();

    // Types valides pour les colonnes additionnelles
    const WRITABLE_TYPES = new Set([
      'text','number','select','mSelect','date','checkbox',
      'url','email','phone','mAsset'
    ]);
    // Types système (read-only, déclarables mais pas de valeur à écrire)
    const SYSTEM_TYPES = new Set(['created','updated','lineNumber','template','rollup','relation']);

    // Construire keyValues : colonne primaire + colonnes additionnelles
    const keyValues: any[] = [
      {
        key: {
          id: primaryId,
          name: 'Name',
          type: 'block',
          icon: '', desc: '', numberFormat: '', template: ''
        },
        values: []
      }
    ];

    const viewColumns: any[] = [
      { id: primaryId, width: '', hidden: false, pin: false, icon: '', calc: null }
    ];

    for (const col of columns) {
      const colType = col.type?.trim() ?? 'text';
      const colName = col.name?.trim();
      if (!colName) continue;

      // block = primary key, auto-created above — silently skip if declared in fields
      if (colType === 'block') continue;

      if (!WRITABLE_TYPES.has(colType) && !SYSTEM_TYPES.has(colType)) {
        throw new Error(`Unknown field type: "${colType}". Valid types: ${[...WRITABLE_TYPES].join(', ')}`);
      }

      const colId = this.generateSiyuanId();
      const key: any = { id: colId, name: colName, type: colType, icon: '', desc: '' };

      if (colType === 'number')   key.numberFormat = '';
      if (colType === 'template') key.template = '';
      if (colType === 'relation') key.relation = { avID: '', isTwoWay: false, backKeyID: '' };
      if (colType === 'mSelect' || colType === 'select') key.options = [];

      keyValues.push({ key, values: [] });
      viewColumns.push({ id: colId, width: '', hidden: false, pin: false, icon: '', calc: null });
    }

    // Construire le JSON de la database
    const dbJson = {
      spec: 1,
      id: avId,
      name: dbName,
      keyValues,
      keyIDs: null,
      viewID: viewId,
      views: [
        {
          id: viewId,
          icon: '', name: 'Default View', hideAttrViewName: false,
          desc: '', pageSize: 50, type: 'table',
          table: {
            columns: viewColumns,
            rowIds: [], filters: [], sorts: [],
            groupBy: null, calcs: null
          },
          itemIds: [],
          groupCreated: null, groupItemIds: null,
          groupFolded: null, groupHidden: null, groupSort: null
        }
      ]
    };

    // Écrire le fichier JSON via l'API HTTP putFile
    const avHttpPath = `/data/storage/av/${avId}.json`;
    await this.client.filePut(avHttpPath, JSON.stringify(dbJson, null, 2));

    const avBlockHtml = `<div data-type="NodeAttributeView" data-av-id="${avId}" data-av-type="table"></div>`;

    if (parentDocId?.trim()) {
      // EMBED mode: insert the AV block directly into the parent document
      // No separate home doc created — matches SiYuan GUI behavior (/database command)
      const embedResp = await this.client.request('/api/block/insertBlock', {
        dataType: 'markdown',
        data: avBlockHtml,
        parentID: parentDocId.trim()
      });

      if (!embedResp || embedResp.code !== 0) {
        try { await this.client.request('/api/file/removeFile', { path: avHttpPath }); } catch {}
        throw new Error(`AV block insertion into parent doc failed: ${embedResp?.msg ?? 'unknown error'}`);
      }

      return { avId, docId: parentDocId.trim(), name: dbName, notebookId: notebookId.trim(), embeddedInParent: true };
    }

    // STANDALONE mode: create a dedicated doc at notebook root
    const docResp = await this.client.request('/api/filetree/createDocWithMd', {
      notebook: notebookId.trim(),
      path: `/${dbName}`,
      markdown: ''
    });

    if (!docResp || docResp.code !== 0) {
      try { await this.client.request('/api/file/removeFile', { path: avHttpPath }); } catch {}
      throw new Error(`Document creation failed: ${docResp?.msg ?? 'unknown error'}`);
    }

    const docId: string = docResp.data;

    const blockResp = await this.client.request('/api/block/insertBlock', {
      dataType: 'markdown',
      data: avBlockHtml,
      parentID: docId
    });

    if (!blockResp || blockResp.code !== 0) {
      throw new Error(`AV block insertion failed: ${blockResp?.msg ?? 'unknown error'}`);
    }

    return { avId, docId, name: dbName, notebookId: notebookId.trim(), embeddedInParent: false };
  }

  // ==================== Entry management ====================

  /**
   * Get a single entry by ID.
   * Uses renderDatabase and filters — single HTTP call.
   */
  async getEntry(avId: string, entryId: string): Promise<AVRow | null> {
    if (!avId?.trim()) throw new Error('avId is required');
    if (!entryId?.trim()) throw new Error('entryId is required');
    const db = await this.renderDatabase(avId);
    return db.entries.find((r: AVRow) => r.id === entryId.trim()) ?? null;
  }

  /**
   * Create multiple entries via /api/av/appendAttributeViewDetachedBlocksWithValues.
   * Sends all rows in a single API call (2D array format).
   * entries: [{ name?, values: [{ fieldId, type, content }] }]
   */
  async bulkCreateEntries(
    avId: string,
    entries: Array<{ name?: string; values?: AVCreateRowValue[] }>
  ): Promise<AVRow[]> {
    if (!avId?.trim()) throw new Error('avId is required');
    if (!entries?.length) throw new Error('entries array must not be empty');

    const before = await this.renderDatabase(avId);
    const beforeIds = new Set(before.entries.map((r: AVRow) => r.id));
    const pkField = before.fields.find((f: AVColumn) => f.type === 'block');
    if (!pkField) throw new Error('Primary field (block type) not found in this database');

    // Build 2D array: each element is an array of cells for one row
    const blocksValues = entries.map(entry =>
      this.buildAppendRow(pkField.id, entry.name ?? '', entry.values ?? [], before.fields)
    );

    const response = await this.client.request('/api/av/appendAttributeViewDetachedBlocksWithValues', {
      avID: avId.trim(),
      blocksValues
    });

    if (!response || response.code !== 0) {
      throw new Error(`Failed to create entries: ${response?.msg ?? 'unknown error'}`);
    }

    const after = await this.renderDatabase(avId);
    return after.entries.filter((r: AVRow) => !beforeIds.has(r.id));
  }

  /**
   * Update multiple entries in a single batchSetAttributeViewBlockAttrs call.
   * updates: [{ entryId, changes: [{ fieldId, type, content }] }]
   */
  async bulkUpdateEntries(
    avId: string,
    updates: Array<{ entryId: string; changes: AVCreateRowValue[] }>
  ): Promise<{ updatedCount: number; entryIds: string[] }> {
    if (!avId?.trim()) throw new Error('avId is required');
    if (!updates?.length) throw new Error('updates array must not be empty');

    const values: any[] = [];
    for (const u of updates) {
      for (const change of u.changes) {
        values.push({
          keyID: change.fieldId,
          rowID: u.entryId,
          value: this.buildUpdateValue(change)
        });
      }
    }

    const response = await this.client.request('/api/av/batchSetAttributeViewBlockAttrs', {
      avID: avId,
      values
    });

    if (!response || response.code !== 0) {
      throw new Error(`Bulk update failed: ${response?.msg ?? 'unknown error'}`);
    }

    return {
      updatedCount: updates.length,
      entryIds: updates.map(u => u.entryId)
    };
  }

  // ==================== Field management ====================

  /**
   * List all fields of a database.
   * Uses renderAttributeView (kernel model) — canonical source of field IDs.
   * fileGet can be out of sync with the kernel after delete/recreate sequences.
   */
  async listFields(avId: string): Promise<AVField[]> {
    if (!avId?.trim()) throw new Error('avId is required');
    const db = await this.renderDatabase(avId);
    return db.fields.map((f: AVColumn) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      options: (f as any).options ?? undefined
    }));
  }

  /**
   * Add a new field to a database via /api/av/addAttributeViewKey.
   *
   * Uses SiYuan's official API so the change is registered in the kernel's
   * internal model (undo/redo, sync, GUI update all work correctly).
   *
   * Note: select/mSelect fields are created without initial options.
   * Options are auto-created when entry values are set via av_update_entry /
   * av_bulk_update_entries.
   */
  async createField(
    avId: string,
    name: string,
    type: string,
  ): Promise<AVField> {
    if (!avId?.trim()) throw new Error('avId is required');
    if (!name?.trim()) throw new Error('name is required');

    const WRITABLE_TYPES = new Set([
      'text','number','select','mSelect','date','checkbox',
      'url','email','phone','mAsset'
    ]);
    const SYSTEM_TYPES = new Set(['relation','rollup','created','updated','lineNumber','template']);

    if (type === 'block') {
      throw new Error(`Field type "block" is the primary key and is auto-created. You cannot add a second one.`);
    }
    if (SYSTEM_TYPES.has(type)) {
      throw new Error(`Field type "${type}" is system-managed and cannot be created via MCP.`);
    }
    if (!WRITABLE_TYPES.has(type)) {
      throw new Error(`Unknown field type: "${type}". Valid: ${[...WRITABLE_TYPES].join(', ')}`);
    }

    // Get current view column order to append the new field at the end.
    // Reading the JSON file (read-only) is lighter than renderAttributeView which loads all rows.
    const avHttpPath = `/data/storage/av/${avId.trim()}.json`;
    const dbJson = await this.client.fileGet(avHttpPath);
    if (!dbJson || typeof dbJson !== 'object') {
      throw new Error(`Database not found: ${avId}`);
    }
    const viewCols: any[] = dbJson.views?.[0]?.table?.columns ?? [];
    const lastColId = viewCols.length > 0 ? viewCols[viewCols.length - 1].id : '';

    const fieldId = this.generateSiyuanId();

    const response = await this.client.request('/api/av/addAttributeViewKey', {
      avID: avId.trim(),
      keyID: fieldId,
      keyName: name.trim(),
      keyType: type,
      keyIcon: '',
      previousKeyID: lastColId
    });

    if (!response || response.code !== 0) {
      throw new Error(`Failed to create field: ${response?.msg ?? 'unknown error'}`);
    }

    return { id: fieldId, name: name.trim(), type };
  }

  /**
   * Rename a field via SiYuan's API.
   *
   * SiYuan does not expose a public HTTP endpoint for renaming AV columns.
   * The only way to rename is through SiYuan's GUI.
   * As a workaround this method implements: delete-old + create-new + migrate values.
   * WARNING: this does NOT migrate existing cell values — data is preserved by SiYuan
   * only when using the GUI rename. For a lossless rename, use SiYuan's UI directly.
   */
  async updateField(
    avId: string,
    fieldId: string,
    changes: { name?: string; options?: any[] }
  ): Promise<AVField> {
    if (!avId?.trim()) throw new Error('avId is required');
    if (!fieldId?.trim()) throw new Error('fieldId is required');

    // Verify the field exists
    const fields = await this.listFields(avId);
    const field = fields.find((f: AVField) => f.id === fieldId.trim());
    if (!field) throw new Error(`Field "${fieldId}" not found in database`);
    if (field.type === 'block') throw new Error('Cannot modify the primary key field');

    if (changes.name !== undefined) {
      // SiYuan has no public API for renaming AV columns. The only reliable path is
      // the GUI. Surfacing a clear error is better than silently doing nothing.
      throw new Error(
        `Renaming fields is not supported via SiYuan's public API. ` +
        `To rename field "${field.name}", use SiYuan's GUI: ` +
        `click the column header → rename. ` +
        `Alternatively, delete the field and recreate it with the new name ` +
        `(note: existing cell values will be lost).`
      );
    }

    // No other changes supported at this time
    return field;
  }

  /**
   * Delete a field from a database via /api/av/removeAttributeViewKey.
   * Refuses to delete the primary key field (block type).
   */
  async deleteField(avId: string, fieldId: string): Promise<void> {
    if (!avId?.trim()) throw new Error('avId is required');
    if (!fieldId?.trim()) throw new Error('fieldId is required');

    // Verify existence and guard primary key
    const fields = await this.listFields(avId);
    const field = fields.find((f: AVField) => f.id === fieldId.trim());
    if (!field) throw new Error(`Field "${fieldId}" not found in database`);
    if (field.type === 'block') {
      throw new Error('Cannot delete the primary key field (block type)');
    }

    const response = await this.client.request('/api/av/removeAttributeViewKey', {
      avID: avId.trim(),
      keyID: fieldId.trim()
    });

    if (!response || response.code !== 0) {
      throw new Error(`Failed to delete field: ${response?.msg ?? 'unknown error'}`);
    }
  }

  // ==================== Helpers privés ====================

  /**
   * Génère un ID SiYuan au format YYYYMMDDHHMMSS-xxxxxxx.
   */
  private generateSiyuanId(): string {
    const now = new Date();
    const ts = now.getFullYear().toString()
      + String(now.getMonth() + 1).padStart(2, '0')
      + String(now.getDate()).padStart(2, '0')
      + String(now.getHours()).padStart(2, '0')
      + String(now.getMinutes()).padStart(2, '0')
      + String(now.getSeconds()).padStart(2, '0');
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const suffix = Array.from({ length: 7 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
    return `${ts}-${suffix}`;
  }

  /**
   * Convertit un AVCreateRowValue au format attendu par setAttributeViewBlockAttr.
   * Différent de buildBlockValue : retourne uniquement la partie typée {text: {...}},
   * sans keyID/type/isDetached qui sont passés séparément dans la requête.
   */
  private buildUpdateValue(v: AVCreateRowValue): any {
    switch (v.type) {
      case 'text':
      case 'url':
      case 'email':
      case 'phone':
        return { [v.type]: { content: String(v.content ?? '') } };
      case 'number':
        return { number: { content: Number(v.content), isNotEmpty: true } };
      case 'checkbox':
        return { checkbox: { checked: Boolean(v.content) } };
      case 'select':
        // SiYuan stocke select en mSelect (tableau) même pour single-select
        return { mSelect: [{ content: String(v.content ?? '') }] };
      case 'mSelect': {
        const items = Array.isArray(v.content) ? v.content : [v.content];
        return { mSelect: items.map((c: any) => ({ content: String(c) })) };
      }
      case 'date':
        return { date: { content: Number(v.content), isNotEmpty: true } };
      case 'mAsset': {
        // content: array of {type, name, content} or a single object
        const assets = Array.isArray(v.content) ? v.content : [v.content];
        return {
          mAsset: assets.map((a: any) => ({
            type: a.type ?? 'file',
            name: a.name ?? '',
            content: a.content ?? ''
          }))
        };
      }
      // System-managed / computed types — not writable via MCP
      case 'created':
      case 'updated':
      case 'lineNumber':
      case 'template':
      case 'rollup':
      case 'relation':
        throw new Error(
          `Field type "${v.type}" is system-managed or computed — cannot write a value manually.`
        );
      default:
        return { [v.type]: { content: v.content } };
    }
  }

  /**
   * Build one row for appendAttributeViewDetachedBlocksWithValues.
   * Returns an array of cell objects (one per field with a value).
   * Format: [{ keyID, block/number/text/mSelect/... }, ...]
   */
  private buildAppendRow(
    pkFieldId: string,
    name: string,
    values: AVCreateRowValue[],
    fields: AVColumn[]
  ): any[] {
    const cells: any[] = [{ keyID: pkFieldId, block: { content: name ?? '' } }];

    for (const v of values) {
      if (v.fieldId === pkFieldId) continue;
      const field = fields.find((f: AVColumn) => f.id === v.fieldId);
      if (!field) continue;
      const cell = this.buildAppendCell(v);
      if (cell) cells.push(cell);
    }

    return cells;
  }

  /**
   * Build a single cell object for the appendAttributeViewDetachedBlocksWithValues 2D array.
   * Returns null for system-managed / unsupported types (caller silently skips them).
   */
  private buildAppendCell(v: AVCreateRowValue): any | null {
    const base: any = { keyID: v.fieldId };

    switch (v.type) {
      case 'text':
      case 'url':
      case 'email':
      case 'phone':
        base[v.type] = { content: String(v.content ?? '') };
        break;
      case 'number':
        base.number = { content: Number(v.content) };
        break;
      case 'checkbox':
        base.checkbox = { checked: Boolean(v.content) };
        break;
      case 'select':
        // appendAttributeViewDetachedBlocksWithValues uses mSelect format for both select/mSelect
        base.mSelect = [{ content: String(v.content ?? '') }];
        break;
      case 'mSelect': {
        const items = Array.isArray(v.content) ? v.content : [v.content];
        base.mSelect = items.map((c: any) => ({ content: String(c) }));
        break;
      }
      case 'date':
        base.date = { content: Number(v.content) };
        break;
      case 'mAsset': {
        const assets = Array.isArray(v.content) ? v.content : [v.content];
        base.mAsset = assets.map((a: any) => ({
          type: a.type ?? 'file',
          name: a.name ?? '',
          content: a.content ?? ''
        }));
        break;
      }
      // System-managed / computed — skip silently
      case 'created':
      case 'updated':
      case 'lineNumber':
      case 'template':
      case 'rollup':
      case 'relation':
        return null;
      default:
        return null;
    }

    return base;
  }

  /**
   * Parse la réponse brute de renderAttributeView en AVDatabase normalisée.
   * Structure canonique CLAUDE.md :
   *   data.view.columns / data.view.rows
   *   cell.value.keyID  ← ID de colonne dans la cellule
   */
  private parseRawResponse(id: string, data: any): AVDatabase {
    if (!data) {
      return { id, name: '', fields: [], entries: [], total: 0 };
    }

    const view = data.view ?? data;
    const rawColumns: any[] = view.columns ?? data.columns ?? [];
    const rawRows: any[]    = view.rows    ?? data.rows    ?? [];

    const columns = parseColumns(rawColumns);

    const rows: AVRow[] = rawRows
      .filter((row: any) => row?.id)
      .map((row: any) => parseRow(row, columns));

    return {
      id: data.id ?? id,
      name: data.name ?? view.name ?? id,
      viewId: view.id ?? data.viewID,
      viewType: view.type ?? data.viewType ?? 'table',
      fields: columns,
      entries: rows,
      total: rows.length
    };
  }
}
