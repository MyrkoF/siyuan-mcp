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
   * Met à jour la valeur d'une cellule via /api/av/setAttributeViewBlockAttr.
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
   * Crée une nouvelle ligne (détachée) dans la database via
   * /api/av/appendAttributeViewDetachedBlocksWithValues.
   *
   * La colonne de type "block" (colonne primaire) est toujours requise par l'API.
   * Elle est ajoutée automatiquement avec `name` comme contenu.
   *
   * L'API ne retourne pas l'ID de la ligne créée → on diff avant/après
   * renderDatabase pour récupérer la nouvelle AVRow.
   *
   * @param avId   — Block ID de la database
   * @param name   — Contenu de la colonne primaire "block" (nom/titre de la ligne)
   * @param values — Valeurs initiales optionnelles des autres colonnes
   * @returns La nouvelle AVRow avec son ID, ou null si introuvable dans le diff
   */
  async createRow(
    avId: string,
    name: string = '',
    values: AVCreateRowValue[] = []
  ): Promise<AVRow | null> {
    if (!avId || avId.trim() === '') {
      throw new Error('avId est requis');
    }

    // Snapshot des IDs actuels + récupération de la colonne block primaire
    const before = await this.renderDatabase(avId);
    const beforeIds = new Set(before.rows.map(r => r.id));

    const blockCol = before.columns.find(c => c.type === 'block');
    if (!blockCol) {
      throw new Error('Colonne primaire de type "block" introuvable dans cette database');
    }

    // Colonne block en premier (obligatoire pour l'API)
    const blockEntry: any = {
      keyID: blockCol.id,
      type: 'block',
      isDetached: true,
      block: { content: name, id: '' }
    };

    // Autres valeurs fournies par l'utilisateur (sans doublon sur la colonne block)
    const otherValues = values
      .filter(v => v.keyId !== blockCol.id)
      .map(v => this.buildBlockValue(v));

    const response = await this.client.request(
      '/api/av/appendAttributeViewDetachedBlocksWithValues',
      {
        avID: avId.trim(),
        blocksValues: [[blockEntry, ...otherValues]]   // 2D array : une seule ligne
      }
    );

    if (!response || response.code !== 0) {
      throw new Error(
        `Création de ligne échouée: ${response?.msg ?? 'erreur inconnue'}`
      );
    }

    // Re-render pour trouver la nouvelle ligne par diff
    const after = await this.renderDatabase(avId);
    const newRow = after.rows.find(r => !beforeIds.has(r.id));

    if (!newRow) return null;

    // Pour les types select/mSelect, setAttributeViewBlockAttr est plus fiable
    // que blocksValues (qui ne crée pas les options à la volée).
    // On rappelle updateRow pour chaque valeur non-block fournie.
    if (values.length > 0) {
      for (const v of values.filter(v => v.keyId !== blockCol.id)) {
        try {
          // buildUpdateValue génère le format attendu par setAttributeViewBlockAttr
          // (différent de buildBlockValue qui est pour appendAttributeViewDetachedBlocksWithValues)
          await this.updateRow(avId, newRow.id, v.keyId, this.buildUpdateValue(v));
        } catch {
          // Ignorer silencieusement — la ligne est créée, les valeurs sont best-effort
        }
      }
      // Re-render final pour retourner les vraies valeurs persistées
      const final = await this.renderDatabase(avId);
      return final.rows.find(r => r.id === newRow.id) ?? newRow;
    }

    return newRow;
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

  // ==================== Helpers privés ====================

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
      case 'template':
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
      default:
        return { [v.type]: { content: v.content } };
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
      case 'template':
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
        // content = timestamp en ms (number) ou string ISO
        base.date = { content: Number(v.content), isNotEmpty: true };
        break;
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
