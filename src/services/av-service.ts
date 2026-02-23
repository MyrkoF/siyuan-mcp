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

export interface AVRow {
  id: string;
  cells: Record<string, any>;
}

export interface AVDatabase {
  id: string;
  name: string;
  viewId?: string;
  viewType?: string;
  columns: AVColumn[];
  rows: AVRow[];
  total: number;
}

export interface AVDatabaseSummary {
  id: string;
  name: string;
  columnCount: number;
  rowCount: number;
}

/**
 * Valeur initiale pour av_create_row.
 * content : string | number | boolean | string[] selon le type.
 */
export interface AVCreateRowValue {
  keyId: string;
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
      throw new Error(`Impossible de lister /data/storage/av: ${dirResponse?.msg ?? 'erreur inconnue'}`);
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
          columnCount: db.columns.length,
          rowCount: db.rows.length
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
      throw new Error('Database ID est requis');
    }

    const response = await this.client.request('/api/av/renderAttributeView', {
      id: id.trim()
    });

    if (!response || response.code !== 0) {
      throw new Error(
        `renderAttributeView échoué pour "${id}": ${response?.msg ?? 'erreur inconnue'}`
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
  async deleteRows(avId: string, rowIds: string[]): Promise<void> {
    if (!avId || avId.trim() === '') {
      throw new Error('avId est requis');
    }
    if (!rowIds || rowIds.length === 0) {
      throw new Error('Au moins un rowId est requis');
    }

    const response = await this.client.request('/api/av/removeAttributeViewBlocks', {
      avID: avId.trim(),
      srcIDs: rowIds
    });

    if (!response || response.code !== 0) {
      throw new Error(
        `Suppression échouée: ${response?.msg ?? 'erreur inconnue'}`
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
    rowId: string,
    updates: AVCreateRowValue[]
  ): Promise<void> {
    if (!avId || !rowId) {
      throw new Error('avId et rowId sont requis');
    }
    if (!updates || updates.length === 0) {
      throw new Error('Au moins une mise à jour est requise');
    }

    const values = updates.map(u => ({
      keyID: u.keyId,
      rowID: rowId,
      value: this.buildUpdateValue(u)
    }));

    const response = await this.client.request('/api/av/batchSetAttributeViewBlockAttrs', {
      avID: avId,
      values
    });

    if (!response || response.code !== 0) {
      throw new Error(`Batch update échoué: ${response?.msg ?? 'erreur inconnue'}`);
    }
  }

  /**
   * Met à jour la valeur d'une cellule via /api/av/setAttributeViewBlockAttr.
   * Utilisé en interne (createRow) pour les cas où batchUpdate n'est pas adapté.
   */
  async updateRow(
    avId: string,
    rowId: string,
    keyId: string,
    value: any
  ): Promise<any> {
    if (!avId || !rowId || !keyId) {
      throw new Error('avId, rowId et keyId sont tous requis');
    }

    const response = await this.client.request('/api/av/setAttributeViewBlockAttr', {
      avID: avId,
      keyID: keyId,
      rowID: rowId,
      value
    });

    if (!response || response.code !== 0) {
      throw new Error(`Mise à jour échouée: ${response?.msg ?? 'erreur inconnue'}`);
    }

    return response.data ?? { avId, rowId, keyId };
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

    // Lire le JSON de la database via l'API HTTP
    const avHttpPath = `/data/storage/av/${avId.trim()}.json`;
    const dbJson = await this.client.fileGet(avHttpPath);
    if (!dbJson || typeof dbJson !== 'object') {
      throw new Error(`Fichier AV introuvable ou invalide: ${avHttpPath}`);
    }

    const keyValues: any[] = dbJson.keyValues ?? [];
    const pkEntry = keyValues.find((kv: any) => kv.key?.type === 'block');
    if (!pkEntry) {
      throw new Error('Colonne primaire de type "block" introuvable dans cette database');
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

    // Valeurs des autres colonnes
    const sysTypes = new Set(['created', 'updated', 'lineNumber', 'template', 'rollup', 'relation']);

    for (const v of values.filter(vv => vv.keyId !== pkEntry.key.id)) {
      const colEntry = keyValues.find((kv: any) => kv.key?.id === v.keyId);
      if (!colEntry) continue;

      const colType = colEntry.key.type as string;
      if (sysTypes.has(colType)) continue;

      if (!colEntry.values) colEntry.values = [];
      const typeData = this.buildJsonValue(v);
      colEntry.values.push({
        id:        this.generateSiyuanId(),
        keyID:     v.keyId,
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
    return rendered.rows.find(r => r.id === rowId) ?? null;
  }

  /**
   * Filtre les entrées d'une database par colonne/valeur (recherche partielle,
   * insensible à la casse).
   */
  async queryDatabase(
    avId: string,
    column: string,
    value: string
  ): Promise<AVDatabase> {
    const db = await this.renderDatabase(avId);

    const targetCol = findColumn(db.columns, column);
    if (!targetCol) {
      throw new Error(
        `Colonne "${column}" introuvable. Disponibles: ${db.columns.map(c => c.name).join(', ')}`
      );
    }

    const lowerValue = value.toLowerCase();

    const filteredRows = db.rows.filter(row => {
      const cellVal = row.cells[targetCol.id];
      if (cellVal === null || cellVal === undefined) return false;

      if (Array.isArray(cellVal)) {
        return cellVal.some(v => String(v).toLowerCase().includes(lowerValue));
      }
      if (typeof cellVal === 'object') {
        // Relations → chercher dans contents
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

    return { ...db, rows: filteredRows, total: filteredRows.length };
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
    if (!notebookId?.trim()) throw new Error('notebookId est requis');
    if (!name?.trim())       throw new Error('name est requis');

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
        throw new Error(`Type de colonne inconnu : "${colType}"`);
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
      throw new Error(`Création du document échouée: ${docResp?.msg ?? 'erreur inconnue'}`);
    }

    const docId: string = docResp.data;

    // Insérer le bloc AV dans le document
    const blockResp = await this.client.request('/api/block/insertBlock', {
      dataType: 'markdown',
      data: `<div data-type="NodeAttributeView" data-av-id="${avId}" data-av-type="table"></div>`,
      parentID: docId
    });

    if (!blockResp || blockResp.code !== 0) {
      throw new Error(`Insertion du bloc AV échouée: ${blockResp?.msg ?? 'erreur inconnue'}`);
    }

    return { avId, docId, name: dbName, notebookId: notebookId.trim() };
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
          `Le type "${v.type}" est géré par le système ou calculé — impossible d'écrire une valeur manuellement.`
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
      keyID: v.keyId,
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
          `Le type "${v.type}" est géré par le système ou calculé — impossible d'écrire une valeur manuellement.`
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
      return { id, name: '', columns: [], rows: [], total: 0 };
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
      columns,
      rows,
      total: rows.length
    };
  }
}
