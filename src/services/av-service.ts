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
import { parseCellValue, parseColumns, parseRow, findColumn } from '../utils/avParser';

// ==================== Types publics ====================

export interface AVColumn {
  id: string;
  name: string;
  type: string;
  options?: any[];
  relation?: {
    avID?: string;
    isTwoWay?: boolean;
    backKeyID?: string;
  };
  rollup?: {
    relationKeyID?: string;
    keyID?: string;
    calc?: {
      operator?: string;
      result?: any;
    };
  };
}

export interface AVField {
  id: string;
  name: string;
  type: string;
  options?: any[];
  relation?: {
    avID?: string;
    isTwoWay?: boolean;
    backKeyID?: string;
  };
  rollup?: {
    relationKeyID?: string;
    keyID?: string;
    calc?: {
      operator?: string;
      result?: any;
    };
  };
}

export interface AVRelationConfig {
  targetAvId: string;
  backRef?: boolean;
  backRefName?: string;
}

export interface AVRollupConfig {
  relationFieldId: string;
  targetFieldId: string;
  calc?: string;
}

export interface AVViewSummary {
  id: string;
  name: string;
  type: string;
  icon?: string;
  desc?: string;
  groupByFieldId?: string;
  filters?: any[];
  sorts?: any[];
}

export interface AVViewConfig {
  name?: string;
  type?: 'table' | 'kanban' | 'gallery';
  groupByFieldId?: string;
  filters?: any[];
  sorts?: any[];
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

    const beforeModel = await this.loadAttributeViewModel(avId);
    const beforeIds = new Set(this.collectModelEntryIds(beforeModel));
    const beforeFields = parseColumns((beforeModel?.keyValues ?? []).map((kv: any) => kv.key));
    const pkField = beforeFields.find((f: AVColumn) => f.type === 'block');
    if (!pkField) throw new Error('Primary field (block type) not found in this database');

    const row = this.buildAppendRow(pkField.id, name, values, beforeFields);

    const response = await this.client.request('/api/av/appendAttributeViewDetachedBlocksWithValues', {
      avID: avId.trim(),
      blocksValues: [row]
    });

    if (!response || response.code !== 0) {
      throw new Error(`Failed to create entry: ${response?.msg ?? 'unknown error'}`);
    }

    const afterModel = await this.loadAttributeViewModel(avId);
    const createdId = this.collectModelEntryIds(afterModel).find(id => !beforeIds.has(id));
    return createdId ? this.buildRowFromModel(afterModel, createdId) : null;
  }

  /**
   * Filtre les entrées d'une database par colonne/valeur (recherche partielle,
   * insensible à la casse).
   *
   * For bidirectional relation fields: if direct filtering finds incomplete results,
   * automatically performs a cross-DB lookup on the related database to find all
   * entries linked via the back-relation. This ensures correct results regardless
   * of which side of the relation the caller queries from.
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

    // For bidirectional relation fields, do a cross-DB lookup to get complete results.
    // SiYuan's renderAttributeView doesn't always populate relation contents on both sides,
    // so direct filtering can miss entries. The cross-DB approach reads the target database,
    // finds matching entries, and uses the back-relation to identify linked entry IDs.
    if (targetCol.type === 'relation' && targetCol.relation?.isTwoWay && targetCol.relation?.avID && targetCol.relation?.backKeyID) {
      const crossDbIds = await this.resolveRelationIds(targetCol.relation.avID, targetCol.relation.backKeyID, lowerValue);
      if (crossDbIds.size > 0) {
        const filteredEntries = db.entries.filter(entry => crossDbIds.has(entry.id));
        return { ...db, entries: filteredEntries, total: filteredEntries.length };
      }
    }

    // Fallback: direct cell value matching (works for non-relation fields and one-way relations)
    const filteredEntries = db.entries.filter(entry => {
      return this.cellMatchesValue(entry.cells[targetCol.id], lowerValue);
    });

    return { ...db, entries: filteredEntries, total: filteredEntries.length };
  }

  /**
   * Check if a cell value matches a search string (partial, case-insensitive).
   */
  private cellMatchesValue(cellVal: any, lowerValue: string): boolean {
    if (cellVal === null || cellVal === undefined) return false;

    if (Array.isArray(cellVal)) {
      return cellVal.some(v => String(v).toLowerCase().includes(lowerValue));
    }
    if (typeof cellVal === 'object') {
      const contents: any[] = cellVal.contents ?? [];
      if (contents.length > 0) {
        return contents.some((c: any) =>
          String(c?.block?.content ?? c?.content ?? c).toLowerCase().includes(lowerValue)
        );
      }
      if (cellVal.content !== undefined) {
        return String(cellVal.content).toLowerCase().includes(lowerValue);
      }
      return JSON.stringify(cellVal).toLowerCase().includes(lowerValue);
    }
    return String(cellVal).toLowerCase().includes(lowerValue);
  }

  /**
   * Cross-DB relation lookup: reads the target AV, finds entries matching the value
   * in their primary key, then returns the set of entry IDs from the back-relation field.
   * This gives us the complete list of entries linked via a bidirectional relation.
   */
  private async resolveRelationIds(targetAvId: string, backKeyID: string, lowerValue: string): Promise<Set<string>> {
    try {
      const targetDb = await this.renderDatabase(targetAvId);
      const matchedIds = new Set<string>();

      for (const entry of targetDb.entries) {
        // Check if any cell in this entry matches the search value (primary key or any text field)
        const primaryKey = Object.values(entry.cells).find((c: any) => c && typeof c === 'object' && 'content' in c && c.content);
        if (primaryKey && String((primaryKey as any).content).toLowerCase().includes(lowerValue)) {
          // Found a match — now get the back-relation field to find linked entry IDs
          const backRelation = entry.cells[backKeyID];
          if (backRelation && backRelation.ids) {
            for (const id of backRelation.ids) {
              matchedIds.add(id);
            }
          }
        }
      }
      return matchedIds;
    } catch {
      return new Set();
    }
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
    const renderedRow = db.entries.find((r: AVRow) => r.id === entryId.trim());
    if (renderedRow) {
      return renderedRow;
    }

    const model = await this.loadAttributeViewModel(avId);
    return this.buildRowFromModel(model, entryId.trim());
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

    const beforeModel = await this.loadAttributeViewModel(avId);
    const beforeIds = new Set(this.collectModelEntryIds(beforeModel));
    const beforeFields = parseColumns((beforeModel?.keyValues ?? []).map((kv: any) => kv.key));
    const pkField = beforeFields.find((f: AVColumn) => f.type === 'block');
    if (!pkField) throw new Error('Primary field (block type) not found in this database');

    const blocksValues = entries.map(entry =>
      this.buildAppendRow(pkField.id, entry.name ?? '', entry.values ?? [], beforeFields)
    );

    const response = await this.client.request('/api/av/appendAttributeViewDetachedBlocksWithValues', {
      avID: avId.trim(),
      blocksValues
    });

    if (!response || response.code !== 0) {
      throw new Error(`Failed to create entries: ${response?.msg ?? 'unknown error'}`);
    }

    const afterModel = await this.loadAttributeViewModel(avId);
    const createdIds = this.collectModelEntryIds(afterModel).filter(id => !beforeIds.has(id));
    return createdIds
      .map(id => this.buildRowFromModel(afterModel, id))
      .filter((row): row is AVRow => row !== null);
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
      options: f.options ?? undefined,
      relation: f.relation ?? undefined,
      rollup: f.rollup ?? undefined
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

    const CREATABLE_TYPES = new Set([
      'text','number','select','mSelect','date','checkbox',
      'url','email','phone','mAsset','relation','rollup'
    ]);
    const READ_ONLY_TYPES = new Set(['created','updated','lineNumber','template']);

    if (type === 'block') {
      throw new Error(`Field type "block" is the primary key and is auto-created. You cannot add a second one.`);
    }
    if (READ_ONLY_TYPES.has(type)) {
      throw new Error(`Field type "${type}" is system-managed and cannot be created via MCP.`);
    }
    if (!CREATABLE_TYPES.has(type)) {
      throw new Error(`Unknown field type: "${type}". Valid: ${[...CREATABLE_TYPES].join(', ')}`);
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

  async createRelationField(avId: string, name: string, relation: AVRelationConfig): Promise<AVField> {
    if (!relation?.targetAvId?.trim()) throw new Error('relation.targetAvId is required');

    const field = await this.createField(avId, name, 'relation');
    const backRelationKeyId = relation.backRef ? this.generateSiyuanId() : '';

    await this.performTransactions([
      {
        action: 'updateAttrViewColRelation',
        avID: avId.trim(),
        id: relation.targetAvId.trim(),
        keyID: field.id,
        isTwoWay: Boolean(relation.backRef),
        backRelationKeyID: backRelationKeyId,
        name: relation.backRefName?.trim() || '',
        format: name.trim()
      }
    ]);

    return {
      id: field.id,
      name: name.trim(),
      type: 'relation',
      relation: {
        avID: relation.targetAvId.trim(),
        isTwoWay: Boolean(relation.backRef),
        backKeyID: backRelationKeyId || undefined
      }
    };
  }

  async createRollupField(avId: string, name: string, rollup: AVRollupConfig): Promise<AVField> {
    if (!rollup?.relationFieldId?.trim()) throw new Error('rollup.relationFieldId is required');
    if (!rollup?.targetFieldId?.trim()) throw new Error('rollup.targetFieldId is required');

    const field = await this.createField(avId, name, 'rollup');

    await this.performTransactions([
      {
        action: 'updateAttrViewColRollup',
        avID: avId.trim(),
        id: field.id,
        parentID: rollup.relationFieldId.trim(),
        keyID: rollup.targetFieldId.trim(),
        data: {
          calc: {
            operator: this.mapRollupCalcOperator(rollup.calc)
          }
        }
      }
    ]);

    return {
      id: field.id,
      name: name.trim(),
      type: 'rollup',
      rollup: {
        relationKeyID: rollup.relationFieldId.trim(),
        keyID: rollup.targetFieldId.trim(),
        calc: {
          operator: this.mapRollupCalcOperator(rollup.calc)
        }
      }
    };
  }

  async listViews(avId: string): Promise<AVViewSummary[]> {
    const db = await this.renderDatabase(avId);
    const raw = await this.client.request('/api/av/renderAttributeView', { id: avId.trim() });
    const views = raw?.data?.views ?? [];
    const currentView = raw?.data?.view ?? null;

    return views.map((view: any) => {
      const fullView = currentView && currentView.id === view.id ? currentView : null;
      return {
        id: view.id,
        name: view.name,
        type: view.type,
        icon: view.icon ?? '',
        desc: view.desc ?? '',
        groupByFieldId: fullView?.group?.field ?? undefined,
        filters: fullView?.filters ?? [],
        sorts: fullView?.sorts ?? []
      };
    });
  }

  async addView(avId: string, config: Required<Pick<AVViewConfig, 'type'>> & AVViewConfig): Promise<AVViewSummary> {
    const blockId = await this.resolveDatabaseBlockId(avId);
    const viewId = this.generateSiyuanId();

    await this.performTransactions([
      {
        action: 'addAttrViewView',
        avID: avId.trim(),
        id: viewId,
        blockID: blockId,
        layout: config.type
      }
    ]);

    const ops: any[] = [];
    if (config.name?.trim()) {
      ops.push({ action: 'setAttrViewViewName', avID: avId.trim(), id: viewId, data: config.name.trim() });
    }
    if (config.filters) {
      ops.push({ action: 'setAttrViewFilters', avID: avId.trim(), blockID: blockId, data: config.filters });
    }
    if (config.sorts) {
      ops.push({ action: 'setAttrViewSorts', avID: avId.trim(), blockID: blockId, data: config.sorts });
    }
    if (config.groupByFieldId && config.type === 'kanban') {
      ops.push({
        action: 'setAttrViewGroup',
        avID: avId.trim(),
        blockID: blockId,
        data: { field: config.groupByFieldId.trim() }
      });
    }

    if (ops.length) {
      await this.performTransactions(ops);
    }

    const views = await this.listViews(avId);
    const created = views.find(view => view.id === viewId);
    if (!created) throw new Error(`Failed to find created view ${viewId}`);
    return created;
  }

  async updateView(avId: string, viewId: string, config: AVViewConfig): Promise<AVViewSummary> {
    const blockId = await this.resolveDatabaseBlockId(avId);
    const viewBlockId = await this.resolveViewBlockId(avId, viewId, blockId);
    const ops: any[] = [];

    if (config.type) {
      ops.push({
        action: 'changeAttrViewLayout',
        avID: avId.trim(),
        blockID: viewBlockId,
        layout: config.type
      });
    }
    if (config.name?.trim()) {
      ops.push({ action: 'setAttrViewViewName', avID: avId.trim(), id: viewId.trim(), data: config.name.trim() });
    }
    if (config.filters) {
      ops.push({ action: 'setAttrViewFilters', avID: avId.trim(), blockID: viewBlockId, data: config.filters });
    }
    if (config.sorts) {
      ops.push({ action: 'setAttrViewSorts', avID: avId.trim(), blockID: viewBlockId, data: config.sorts });
    }
    if (config.groupByFieldId) {
      ops.push({
        action: 'setAttrViewGroup',
        avID: avId.trim(),
        blockID: viewBlockId,
        data: { field: config.groupByFieldId.trim() }
      });
    }

    if (!ops.length) throw new Error('No view changes provided');
    await this.performTransactions(ops);

    const views = await this.listViews(avId);
    const updated = views.find(view => view.id === viewId.trim());
    if (!updated) throw new Error(`Failed to find updated view ${viewId}`);
    return updated;
  }

  async deleteView(avId: string, viewId: string): Promise<void> {
    const blockId = await this.resolveViewBlockId(avId, viewId);
    await this.performTransactions([
      {
        action: 'removeAttrViewView',
        avID: avId.trim(),
        blockID: blockId
      }
    ]);
  }

  async listSelectOptions(avId: string, fieldId: string): Promise<any[]> {
    const fields = await this.listFields(avId);
    const field = fields.find(f => f.id === fieldId.trim());
    if (!field) throw new Error(`Field "${fieldId}" not found in database`);
    return field.options ?? [];
  }

  async setSelectOptions(avId: string, fieldId: string, options: Array<{ name: string; color?: string; desc?: string }>): Promise<any[]> {
    await this.performTransactions([
      {
        action: 'updateAttrViewColOptions',
        avID: avId.trim(),
        id: fieldId.trim(),
        data: options.map(option => ({
          name: option.name,
          color: option.color ?? '',
          desc: option.desc ?? ''
        }))
      }
    ]);

    return this.listSelectOptions(avId, fieldId);
  }

  async bindRowToDoc(avId: string, entryId: string, docId: string): Promise<AVRow | null> {
    if (!avId?.trim()) throw new Error('avId is required');
    if (!entryId?.trim()) throw new Error('entryId is required');
    if (!docId?.trim()) throw new Error('docId is required');

    const response = await this.client.request('/api/av/batchReplaceAttributeViewBlocks', {
      avID: avId.trim(),
      isDetached: false,
      oldNew: [{ [entryId.trim()]: docId.trim() }]
    });

    if (!response || response.code !== 0) {
      throw new Error(`Failed to bind row to document: ${response?.msg ?? 'unknown error'}`);
    }

    return this.getEntry(avId, entryId);
  }

  async createDocBackedRow(
    avId: string,
    notebookId: string,
    path: string,
    title: string,
    content: string = '',
    values: AVCreateRowValue[] = []
  ): Promise<AVRow | null> {
    const docResp = await this.client.request('/api/filetree/createDocWithMd', {
      notebook: notebookId.trim(),
      path,
      markdown: content
    });

    if (!docResp || docResp.code !== 0 || !docResp.data) {
      throw new Error(`Failed to create document-backed row document: ${docResp?.msg ?? 'unknown error'}`);
    }

    const docId = typeof docResp.data === 'string' ? docResp.data : docResp.data.id;
    const blockId = await this.resolveDatabaseBlockId(avId);

    const addResp = await this.client.request('/api/av/addAttributeViewBlocks', {
      avID: avId.trim(),
      blockID: blockId,
      srcs: [{ id: docId, content: title.trim(), isDetached: false }]
    });

    if (!addResp || addResp.code !== 0) {
      throw new Error(`Failed to create document-backed row: ${addResp?.msg ?? 'unknown error'}`);
    }

    const itemMapResp = await this.client.request('/api/av/getAttributeViewItemIDsByBoundIDs', {
      avID: avId.trim(),
      blockIDs: [docId]
    });

    const entryId = itemMapResp?.data?.[docId] ?? null;
    if (!entryId) {
      throw new Error('Document-backed row was created, but entry ID could not be resolved');
    }

    if (values.length) {
      await this.bulkUpdateEntries(avId.trim(), [{ entryId, changes: values }]);
    }

    return this.getEntry(avId.trim(), entryId);
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

  private async performTransactions(operations: any[]): Promise<any> {
    const response = await this.client.request('/api/transactions', {
      transactions: [
        {
          doOperations: operations,
          undoOperations: []
        }
      ],
      reqId: Date.now()
    });

    if (!response || response.code !== 0) {
      throw new Error(`Transaction failed: ${response?.msg ?? 'unknown error'}`);
    }

    return response.data;
  }

  private async resolveDatabaseBlockId(avId: string): Promise<string> {
    const response = await this.client.request('/api/av/getMirrorDatabaseBlocks', {
      avID: avId.trim()
    });

    const refDefs = response?.data?.refDefs ?? [];
    const first = refDefs[0];
    if (!first?.refID) {
      throw new Error(`Could not resolve database block ID for AV ${avId}`);
    }
    return first.refID;
  }

  private async resolveViewBlockId(avId: string, viewId: string, fallbackBlockId?: string): Promise<string> {
    const blockId = fallbackBlockId ?? await this.resolveDatabaseBlockId(avId);
    const raw = await this.client.request('/api/av/renderAttributeView', {
      id: avId.trim(),
      blockID: blockId
    });

    const currentViewId = raw?.data?.viewID ?? raw?.data?.view?.id;
    if (currentViewId === viewId.trim()) {
      return blockId;
    }

    await this.performTransactions([
      {
        action: 'setAttrViewBlockView',
        avID: avId.trim(),
        blockID: blockId,
        id: viewId.trim()
      }
    ]);

    return blockId;
  }

  private mapRollupCalcOperator(calc?: string): string {
    switch ((calc ?? 'none').trim()) {
      case 'count':
        return 'CountAll';
      case 'countDistinct':
        return 'CountUniqueValues';
      case 'sum':
        return 'Sum';
      case 'avg':
        return 'Average';
      case 'min':
        return 'Min';
      case 'max':
        return 'Max';
      case 'empty':
        return 'CountEmpty';
      case 'notEmpty':
        return 'CountNotEmpty';
      case 'unique':
        return 'UniqueValues';
      case 'checked':
        return 'Checked';
      case 'unchecked':
        return 'Unchecked';
      case 'percent':
        return 'PercentNotEmpty';
      default:
        return 'None';
    }
  }

  private async loadAttributeViewModel(avId: string): Promise<any> {
    const avHttpPath = `/data/storage/av/${avId.trim()}.json`;
    const model = await this.client.fileGet(avHttpPath);
    if (!model || typeof model !== 'object') {
      throw new Error(`Database not found: ${avId}`);
    }
    return model;
  }

  private collectModelEntryIds(model: any): string[] {
    const blockKeyValues = (model?.keyValues ?? []).find((kv: any) => kv?.key?.type === 'block');
    const ids = (blockKeyValues?.values ?? []).map((value: any) => value?.blockID).filter(Boolean);
    return Array.from(new Set(ids));
  }

  private buildRowFromModel(model: any, entryId: string): AVRow | null {
    const keyValues: any[] = model?.keyValues ?? [];
    if (!keyValues.length) {
      return null;
    }

    const columns = parseColumns(keyValues.map((kv: any) => kv.key));
    const cells: Record<string, any> = {};

    for (const kv of keyValues) {
      const value = (kv?.values ?? []).find((item: any) => item?.blockID === entryId);
      if (!value || !kv?.key?.id) {
        continue;
      }
      const colId = kv.key.id;
      const parsed = parseCellValue({ value });
      cells[colId] = parsed;
      if (kv.key.name && kv.key.name !== colId) {
        cells[kv.key.name] = parsed;
      }
    }

    return Object.keys(cells).length ? { id: entryId, cells } : null;
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
      case 'relation': {
        const items = Array.isArray(v.content) ? v.content : [v.content];
        return {
          relation: {
            blockIDs: items.map((item: any) => String(item))
          }
        };
      }
      // System-managed / computed types — not writable via MCP
      case 'created':
      case 'updated':
      case 'lineNumber':
      case 'template':
      case 'rollup':
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
    const rawColumns: any[] = view.columns ?? view.fields ?? data.columns ?? data.fields ?? [];
    const groupedRows: any[] = Array.isArray(view.groups)
      ? view.groups.flatMap((group: any) => group?.rows ?? group?.cards ?? [])
      : [];
    const rawRows: any[] = view.rows ?? view.cards ?? groupedRows ?? data.rows ?? data.cards ?? [];

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
