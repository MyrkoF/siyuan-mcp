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
   * Crée une nouvelle ligne (détachée) dans la database en écrivant directement
   * dans le fichier JSON de l'Attribute View.
   *
   * L'API appendAttributeViewDetachedBlocksWithValues retourne code:0 mais ne
   * persiste pas les lignes de façon fiable — écriture JSON directe utilisée
   * à la place (même mécanisme que createDatabase et addColumn).
   *
   * @param avId   — Block ID de la database
   * @param name   — Contenu de la colonne primaire "block" (nom/titre de la ligne)
   * @param values — Valeurs initiales optionnelles des autres colonnes
   * @returns La nouvelle AVRow avec son ID, ou null si le re-render ne la trouve pas
   */
  async createRow(
    avId: string,
    name: string = '',
    values: AVCreateRowValue[] = []
  ): Promise<AVRow | null> {
    if (!avId || avId.trim() === '') {
      throw new Error('avId est requis');
    }

    // Read the AV JSON file via HTTP API
    const avHttpPath = `/data/storage/av/${avId.trim()}.json`;
    const dbJson = await this.client.fileGet(avHttpPath);
    if (!dbJson || typeof dbJson !== 'object') {
      throw new Error(`AV file not found or invalid: ${avHttpPath}`);
    }

    const keyValues: any[] = dbJson.keyValues ?? [];
    const pkEntry = keyValues.find((kv: any) => kv.key?.type === 'block');
    if (!pkEntry) {
      throw new Error('Primary field of type "block" not found in this database');
    }

    const rowId = this.generateSiyuanId();
    const now   = Date.now();

    // Valeur de la colonne primaire (block)
    if (!pkEntry.values) pkEntry.values = [];
    pkEntry.values.push({
      id:          this.generateSiyuanId(),
      keyID:       pkEntry.key.id,
      blockID:     rowId,
      type:        'block',
      isDetached:  true,
      createdAt:   now,
      updatedAt:   now,
      block: { id: rowId, content: name, created: now, updated: now }
    });

    // Values for other fields
    const sysTypes = new Set(['created', 'updated', 'lineNumber', 'template', 'rollup', 'relation']);

    for (const v of values.filter(vv => vv.fieldId !== pkEntry.key.id)) {
      const colEntry = keyValues.find((kv: any) => kv.key?.id === v.fieldId);
      if (!colEntry) continue;

      const colType = colEntry.key.type as string;
      if (sysTypes.has(colType)) continue;

      if (!colEntry.values) colEntry.values = [];
      const typeData = this.buildJsonValue(v);
      colEntry.values.push({
        id:        this.generateSiyuanId(),
        keyID:     v.fieldId,
        blockID:   rowId,
        type:      colType,
        createdAt: now,
        updatedAt: now,
        ...typeData
      });
    }

    // Écrire le JSON mis à jour via l'API HTTP
    await this.client.filePut(avHttpPath, JSON.stringify(dbJson, null, 2));

    // Re-render pour retourner la ligne avec ses valeurs parsées
    const rendered = await this.renderDatabase(avId);
    return rendered.entries.find((r: AVRow) => r.id === rowId) ?? null;
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
    columns: AVColumnSpec[] = []
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

      if (!WRITABLE_TYPES.has(colType) && !SYSTEM_TYPES.has(colType)) {
        throw new Error(`Unknown field type: "${colType}"`);
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

    // Créer le document dans le notebook
    const docResp = await this.client.request('/api/filetree/createDocWithMd', {
      notebook: notebookId.trim(),
      path: `/${dbName}`,
      markdown: ''
    });

    if (!docResp || docResp.code !== 0) {
      // Nettoyer le fichier créé si la création doc échoue
      try { await this.client.request('/api/file/removeFile', { path: avHttpPath }); } catch {}
      throw new Error(`Document creation failed: ${docResp?.msg ?? 'unknown error'}`);
    }

    const docId: string = docResp.data;

    // Insérer le bloc AV dans le document
    const blockResp = await this.client.request('/api/block/insertBlock', {
      dataType: 'markdown',
      data: `<div data-type="NodeAttributeView" data-av-id="${avId}" data-av-type="table"></div>`,
      parentID: docId
    });

    if (!blockResp || blockResp.code !== 0) {
      throw new Error(`AV block insertion failed: ${blockResp?.msg ?? 'unknown error'}`);
    }

    return { avId, docId, name: dbName, notebookId: notebookId.trim() };
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
   * Create multiple entries in a single getFile → mutate → putFile call.
   * entries: [{ name?, values: [{ fieldId, type, content }] }]
   */
  async bulkCreateEntries(
    avId: string,
    entries: Array<{ name?: string; values?: AVCreateRowValue[] }>
  ): Promise<AVRow[]> {
    if (!avId?.trim()) throw new Error('avId is required');
    if (!entries?.length) throw new Error('entries array must not be empty');

    const avHttpPath = `/data/storage/av/${avId.trim()}.json`;
    const dbJson = await this.client.fileGet(avHttpPath);
    if (!dbJson || typeof dbJson !== 'object') {
      throw new Error(`AV file not found or invalid: ${avHttpPath}`);
    }

    const keyValues: any[] = dbJson.keyValues ?? [];
    const pkEntry = keyValues.find((kv: any) => kv.key?.type === 'block');
    if (!pkEntry) throw new Error('Primary field of type "block" not found in this database');

    const sysTypes = new Set(['created', 'updated', 'lineNumber', 'template', 'rollup', 'relation']);
    const now = Date.now();
    const createdIds: string[] = [];

    for (const entry of entries) {
      const rowId = this.generateSiyuanId();
      createdIds.push(rowId);
      const name = entry.name ?? '';
      const values = entry.values ?? [];

      if (!pkEntry.values) pkEntry.values = [];
      pkEntry.values.push({
        id: this.generateSiyuanId(),
        keyID: pkEntry.key.id,
        blockID: rowId,
        type: 'block',
        isDetached: true,
        createdAt: now,
        updatedAt: now,
        block: { id: rowId, content: name, created: now, updated: now }
      });

      for (const v of values.filter((vv: AVCreateRowValue) => vv.fieldId !== pkEntry.key.id)) {
        const colEntry = keyValues.find((kv: any) => kv.key?.id === v.fieldId);
        if (!colEntry) continue;
        const colType = colEntry.key.type as string;
        if (sysTypes.has(colType)) continue;
        if (!colEntry.values) colEntry.values = [];
        const typeData = this.buildJsonValue(v);
        colEntry.values.push({
          id: this.generateSiyuanId(),
          keyID: v.fieldId,
          blockID: rowId,
          type: colType,
          createdAt: now,
          updatedAt: now,
          ...typeData
        });
      }
    }

    await this.client.filePut(avHttpPath, JSON.stringify(dbJson, null, 2));

    const rendered = await this.renderDatabase(avId);
    return rendered.entries.filter((r: AVRow) => createdIds.includes(r.id));
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
   * List all fields of a database without loading entries.
   * Reads the AV JSON directly (getFile) — single HTTP call.
   */
  async listFields(avId: string): Promise<AVField[]> {
    if (!avId?.trim()) throw new Error('avId is required');
    const avHttpPath = `/data/storage/av/${avId.trim()}.json`;
    const dbJson = await this.client.fileGet(avHttpPath);
    if (!dbJson || typeof dbJson !== 'object') {
      throw new Error(`AV file not found or invalid: ${avHttpPath}`);
    }
    const keyValues: any[] = dbJson.keyValues ?? [];
    return keyValues
      .filter((kv: any) => kv.key)
      .map((kv: any) => ({
        id: kv.key.id,
        name: kv.key.name,
        type: kv.key.type,
        options: kv.key.options ?? undefined
      }));
  }

  /**
   * Add a new field to a database.
   * Uses getFile → mutate → putFile (same pattern as createEntry/createDatabase).
   * Rejected types: relation, rollup, created, updated, lineNumber, template.
   */
  async createField(
    avId: string,
    name: string,
    type: string,
    options?: any
  ): Promise<AVField> {
    if (!avId?.trim()) throw new Error('avId is required');
    if (!name?.trim()) throw new Error('name is required');

    const WRITABLE_TYPES = new Set([
      'text','number','select','mSelect','date','checkbox',
      'url','email','phone','mAsset'
    ]);
    const SYSTEM_TYPES = new Set(['relation','rollup','created','updated','lineNumber','template']);

    if (SYSTEM_TYPES.has(type)) {
      throw new Error(`Field type "${type}" is system-managed and cannot be created via MCP.`);
    }
    if (!WRITABLE_TYPES.has(type)) {
      throw new Error(`Unknown field type: "${type}". Valid: ${[...WRITABLE_TYPES].join(', ')}`);
    }

    const avHttpPath = `/data/storage/av/${avId.trim()}.json`;
    const dbJson = await this.client.fileGet(avHttpPath);
    if (!dbJson || typeof dbJson !== 'object') {
      throw new Error(`AV file not found or invalid: ${avHttpPath}`);
    }

    const fieldId = this.generateSiyuanId();
    const key: any = { id: fieldId, name: name.trim(), type, icon: '', desc: '' };

    if (type === 'number')                   key.numberFormat = '';
    if (type === 'select' || type === 'mSelect') {
      key.options = Array.isArray(options)
        ? options.map((o: any) => ({ name: o.name ?? '', color: o.color ?? 'default' }))
        : [];
    }
    if (type === 'date' && options) {
      if (options.format)   key.format   = options.format;
      if (options.autoFill) key.autoFill = options.autoFill;
    }

    const keyValues: any[] = dbJson.keyValues ?? [];
    keyValues.push({ key, values: [] });

    // Also add the column to the view table layout
    const views: any[] = dbJson.views ?? [];
    if (views.length > 0 && views[0].table?.columns) {
      views[0].table.columns.push({ id: fieldId, width: '', hidden: false, pin: false, icon: '', calc: null });
    }

    await this.client.filePut(avHttpPath, JSON.stringify(dbJson, null, 2));
    return { id: fieldId, name: name.trim(), type, options: key.options };
  }

  /**
   * Update an existing field's name or options.
   * Uses getFile → mutate → putFile.
   */
  async updateField(
    avId: string,
    fieldId: string,
    changes: { name?: string; options?: any[] }
  ): Promise<AVField> {
    if (!avId?.trim()) throw new Error('avId is required');
    if (!fieldId?.trim()) throw new Error('fieldId is required');

    const avHttpPath = `/data/storage/av/${avId.trim()}.json`;
    const dbJson = await this.client.fileGet(avHttpPath);
    if (!dbJson || typeof dbJson !== 'object') {
      throw new Error(`AV file not found or invalid: ${avHttpPath}`);
    }

    const keyValues: any[] = dbJson.keyValues ?? [];
    const kv = keyValues.find((k: any) => k.key?.id === fieldId.trim());
    if (!kv) throw new Error(`Field "${fieldId}" not found in database`);

    if (changes.name !== undefined) kv.key.name = changes.name.trim();
    if (changes.options !== undefined) {
      kv.key.options = changes.options.map((o: any) => ({
        name: o.name ?? '',
        color: o.color ?? 'default'
      }));
    }

    await this.client.filePut(avHttpPath, JSON.stringify(dbJson, null, 2));
    return { id: kv.key.id, name: kv.key.name, type: kv.key.type, options: kv.key.options };
  }

  /**
   * Delete a field from a database.
   * Refuses to delete the primary key field (block type).
   * Uses getFile → mutate → putFile.
   */
  async deleteField(avId: string, fieldId: string): Promise<void> {
    if (!avId?.trim()) throw new Error('avId is required');
    if (!fieldId?.trim()) throw new Error('fieldId is required');

    const avHttpPath = `/data/storage/av/${avId.trim()}.json`;
    const dbJson = await this.client.fileGet(avHttpPath);
    if (!dbJson || typeof dbJson !== 'object') {
      throw new Error(`AV file not found or invalid: ${avHttpPath}`);
    }

    const keyValues: any[] = dbJson.keyValues ?? [];
    const kv = keyValues.find((k: any) => k.key?.id === fieldId.trim());
    if (!kv) throw new Error(`Field "${fieldId}" not found in database`);
    if (kv.key.type === 'block') {
      throw new Error('Cannot delete the primary key field (block type)');
    }

    dbJson.keyValues = keyValues.filter((k: any) => k.key?.id !== fieldId.trim());

    // Remove from view columns too
    const views: any[] = dbJson.views ?? [];
    for (const view of views) {
      if (view.table?.columns) {
        view.table.columns = view.table.columns.filter((c: any) => c.id !== fieldId.trim());
      }
    }

    await this.client.filePut(avHttpPath, JSON.stringify(dbJson, null, 2));
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
   * Convertit un AVCreateRowValue en données typées pour écriture directe dans
   * le JSON de l'AV (format stockage, différent du format API setAttributeViewBlockAttr).
   * Retourne uniquement les champs spécifiques au type ({text:…}, {mSelect:…}, etc.)
   * à merger dans l'entrée value complète.
   */
  private buildJsonValue(v: AVCreateRowValue): any {
    switch (v.type) {
      case 'text':
      case 'url':
      case 'email':
      case 'phone':
        return { [v.type]: { content: String(v.content ?? '') } };
      case 'number':
        return { number: { content: Number(v.content) } };
      case 'checkbox':
        return { checkbox: { checked: Boolean(v.content) } };
      case 'select':
        // SiYuan stocke select comme mSelect (tableau) même pour single-select
        return { mSelect: [{ content: String(v.content ?? '') }] };
      case 'mSelect': {
        const items = Array.isArray(v.content) ? v.content : [v.content];
        return { mSelect: items.map((c: any) => ({ content: String(c) })) };
      }
      case 'date':
        return { date: { content: Number(v.content), isNotTime: true } };
      case 'mAsset': {
        const assets = Array.isArray(v.content) ? v.content : [v.content];
        return {
          mAsset: assets.map((a: any) => ({
            type:    a.type    ?? 'file',
            name:    a.name    ?? '',
            content: a.content ?? ''
          }))
        };
      }
      default:
        return {};
    }
  }

  /**
   * Convertit un AVCreateRowValue en objet Value SiYuan pour blocksValues.
   */
  private buildBlockValue(v: AVCreateRowValue): any {
    const base: any = {
      keyID: v.fieldId,
      type: v.type,
      isDetached: true
    };

    switch (v.type) {
      case 'text':
      case 'url':
      case 'email':
      case 'phone':
        base[v.type] = { content: String(v.content ?? '') };
        break;
      case 'number':
        base.number = { content: Number(v.content), isNotEmpty: true };
        break;
      case 'checkbox':
        base.checkbox = { checked: Boolean(v.content) };
        break;
      case 'select':
        base.select = { content: String(v.content ?? '') };
        break;
      case 'mSelect': {
        const items = Array.isArray(v.content) ? v.content : [v.content];
        base.mSelect = items.map((c: any) => ({ content: String(c) }));
        break;
      }
      case 'date':
        base.date = { content: Number(v.content), isNotEmpty: true };
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
        base[v.type] = { content: v.content };
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
