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
 * Variables d'env :
 *   SIYUAN_PROJECTS_DB_ID  → ID de la database projets (optionnel)
 *   SIYUAN_TASKS_DB_ID     → ID de la database tâches (optionnel)
 */

import { SiyuanClient } from '../siyuanClient';
import { parseCellValue, parseColumns, parseRow, findColumn } from '../utils/avParser';

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

// ==================== Service ====================

export class AttributeViewService {
  private client: SiyuanClient;

  // Cache léger pour l'auto-discovery (évite les appels répétés)
  private _discoveryCache: Map<string, string> | null = null;

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
   * Retourne tous les projets depuis la database des projets.
   * ID résolu dans l'ordre : SIYUAN_PROJECTS_DB_ID → auto-discovery "DB-Projects"
   */
  async getProjects(): Promise<AVDatabase> {
    const id = await this.resolveDbId(
      process.env.SIYUAN_PROJECTS_DB_ID,
      'DB-Projects'
    );
    return this.renderDatabase(id);
  }

  /**
   * Retourne les tâches depuis la database des tâches.
   * ID résolu dans l'ordre : SIYUAN_TASKS_DB_ID → auto-discovery "DB-Tasks"
   * @param projectId — Row ID du projet pour filtrer (optionnel)
   */
  async getTasksByProject(projectId?: string): Promise<AVDatabase> {
    const id = await this.resolveDbId(
      process.env.SIYUAN_TASKS_DB_ID,
      'DB-Tasks'
    );
    const db = await this.renderDatabase(id);

    if (!projectId) return db;

    const filteredRows = db.rows.filter(row => {
      for (const cellValue of Object.values(row.cells)) {
        if (!cellValue || typeof cellValue !== 'object') continue;

        // Relation → { ids: string[], contents: [...] }
        if (Array.isArray(cellValue.ids) && cellValue.ids.includes(projectId)) {
          return true;
        }
        // Tableau simple de strings (fallback)
        if (Array.isArray(cellValue) && cellValue.includes(projectId)) {
          return true;
        }
      }
      return false;
    });

    return { ...db, rows: filteredRows, total: filteredRows.length };
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
   * Résout l'ID d'une database dans l'ordre :
   * 1. envVarValue (si définie et non vide)
   * 2. Auto-discovery par nom (cherche nameHint dans les databases disponibles)
   */
  private async resolveDbId(
    envVarValue: string | undefined,
    nameHint: string
  ): Promise<string> {
    // 1. Variable d'env explicite
    if (envVarValue && envVarValue.trim() !== '') {
      return envVarValue.trim();
    }

    // 2. Cache de discovery
    if (this._discoveryCache?.has(nameHint)) {
      return this._discoveryCache.get(nameHint)!;
    }

    // 3. Auto-discovery via listDatabases
    const databases = await this.listDatabases();
    const match = databases.find(db =>
      db.name === nameHint ||
      db.name.toLowerCase().includes(nameHint.toLowerCase())
    );

    if (!match) {
      throw new Error(
        `Database "${nameHint}" introuvable. ` +
        `Définissez la variable d'environnement correspondante ou ` +
        `vérifiez le nom de la database dans SiYuan. ` +
        `Databases disponibles: ${databases.map(d => d.name).join(', ') || 'aucune'}`
      );
    }

    // Mettre en cache
    if (!this._discoveryCache) this._discoveryCache = new Map();
    this._discoveryCache.set(nameHint, match.id);

    return match.id;
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
