/**
 * Document Service
 * CRUD complet sur les documents SiYuan via /api/filetree/*
 *
 * Endpoints utilisés :
 * - GET  /api/export/exportMdContent   → contenu Markdown propre
 * - POST /api/filetree/renameDocByID   → renommer
 * - POST /api/filetree/removeDocByID   → supprimer (1 doc)
 * - POST /api/filetree/moveDocsByID    → déplacer
 * - POST /api/query/sql                → trouver les enfants avant suppression
 *
 * Comportement de deleteDocument :
 * - cascade:false (défaut) → si enfants existent : REFUS avec liste des enfants
 * - cascade:true           → supprime enfants depth-first puis parent (tout va en corbeille)
 */

import { SiyuanClient } from '../siyuanClient';

export interface DocContent {
  id: string;
  hPath: string;
  content: string;
}

export interface DocInfo {
  id: string;
  hPath: string;
  path: string;
  box: string;
}

export interface DocDeleteResult {
  id: string;
  deletedChildren: Array<{ id: string; hPath: string }>;
  childCount: number;
}

export class DocService {
  private client: SiyuanClient;

  constructor(client: SiyuanClient) {
    this.client = client;
  }

  // ==================== API publique ====================

  /**
   * Retourne le contenu Markdown d'un document.
   * Utilise /api/export/exportMdContent (plus propre que getBlockKramdown).
   */
  async getDocument(id: string): Promise<DocContent> {
    if (!id?.trim()) throw new Error('id est requis');

    const response = await this.client.request('/api/export/exportMdContent', {
      id: id.trim()
    });

    if (!response || response.code !== 0) {
      throw new Error(`Impossible de lire le document "${id}": ${response?.msg ?? 'erreur inconnue'}`);
    }

    return {
      id,
      hPath: response.data?.hPath ?? '',
      content: response.data?.content ?? ''
    };
  }

  /**
   * Renomme un document.
   * Utilise /api/filetree/renameDocByID.
   */
  async renameDocument(id: string, title: string): Promise<void> {
    if (!id?.trim()) throw new Error('id est requis');
    if (!title?.trim()) throw new Error('title est requis');

    const response = await this.client.request('/api/filetree/renameDocByID', {
      id: id.trim(),
      title: title.trim()
    });

    if (!response || response.code !== 0) {
      throw new Error(`Impossible de renommer le document "${id}": ${response?.msg ?? 'erreur inconnue'}`);
    }
  }

  /**
   * Supprime un document (envoi dans la corbeille SiYuan — récupérable).
   *
   * cascade:false (défaut) — si des enfants existent, REFUSE et retourne leur liste.
   *                          Empêche l'orphelinage silencieux.
   * cascade:true           — supprime tous les enfants depth-first, puis le parent.
   *                          Tout va en corbeille (récupérable).
   *
   * @param id      — Block ID du document à supprimer
   * @param cascade — false: refus si enfants | true: suppression récursive
   */
  async deleteDocument(id: string, cascade: boolean = false): Promise<DocDeleteResult> {
    if (!id?.trim()) throw new Error('id est requis');

    const docId = id.trim();

    // 1. Récupérer les infos du document (path + notebook)
    const info = await this.fetchDocInfo(docId);
    if (!info) {
      throw new Error(`Document "${docId}" introuvable`);
    }

    // 2. Trouver tous les descendants
    const children = await this.fetchDescendants(info.box, info.path);

    // 3. Si enfants présents et cascade désactivé → refus explicite
    if (children.length > 0 && !cascade) {
      const list = children.map(c => `  • "${c.hPath}" (${c.id})`).join('\n');
      throw new Error(
        `Suppression refusée : le document a ${children.length} enfant(s).\n` +
        `Passez cascade:true pour supprimer récursivement, ou déplacez les enfants d'abord.\n` +
        `Enfants :\n${list}`
      );
    }

    // 4. Cascade : supprimer les enfants du plus profond au moins profond
    const deletedChildren: Array<{ id: string; hPath: string }> = [];
    if (cascade && children.length > 0) {
      // Trier par profondeur de path décroissante (plus profond = plus de '/' dans le path)
      const sorted = [...children].sort(
        (a, b) => b.path.split('/').length - a.path.split('/').length
      );
      for (const child of sorted) {
        const resp = await this.client.request('/api/filetree/removeDocByID', { id: child.id });
        if (!resp || resp.code !== 0) {
          throw new Error(
            `Suppression de l'enfant "${child.hPath}" (${child.id}) échouée: ${resp?.msg ?? 'erreur inconnue'}`
          );
        }
        deletedChildren.push({ id: child.id, hPath: child.hPath });
      }
    }

    // 5. Supprimer le parent
    const response = await this.client.request('/api/filetree/removeDocByID', { id: docId });

    if (!response || response.code !== 0) {
      throw new Error(
        `Impossible de supprimer le document "${docId}": ${response?.msg ?? 'erreur inconnue'}`
      );
    }

    return { id: docId, deletedChildren, childCount: deletedChildren.length };
  }

  /**
   * Déplace un ou plusieurs documents vers un parent cible.
   * Utilise /api/filetree/moveDocsByID.
   *
   * @param fromIds — IDs des documents à déplacer (au moins 1)
   * @param toId    — ID du document parent cible OU ID du notebook cible
   */
  async moveDocuments(fromIds: string[], toId: string): Promise<void> {
    if (!fromIds?.length) throw new Error('Au moins un fromId est requis');
    if (!toId?.trim()) throw new Error('toId est requis');

    const response = await this.client.request('/api/filetree/moveDocsByID', {
      fromIDs: fromIds,
      toID: toId.trim()
    });

    if (!response || response.code !== 0) {
      throw new Error(`Impossible de déplacer les documents: ${response?.msg ?? 'erreur inconnue'}`);
    }
  }

  // ==================== Helpers privés ====================

  /**
   * Récupère les infos d'un document via SQL (box, path, hpath).
   * Retourne null si le document n'existe pas.
   */
  private async fetchDocInfo(id: string): Promise<DocInfo | null> {
    const resp = await this.client.request('/api/query/sql', {
      stmt: `SELECT id, box, path, hpath FROM blocks WHERE id='${id}' AND type='d' LIMIT 1`
    });
    const rows: any[] = resp?.data ?? [];
    if (!rows.length) return null;
    return {
      id: rows[0].id,
      box: rows[0].box,
      path: rows[0].path,
      hPath: rows[0].hpath
    };
  }

  /**
   * Trouve tous les documents descendants d'un document via SQL.
   * Utilise le préfixe de path (parent.sy → parent/).
   *
   * @param box        — notebook ID
   * @param parentPath — path du parent (ex: "/foo/bar.sy")
   */
  private async fetchDescendants(
    box: string,
    parentPath: string
  ): Promise<Array<{ id: string; hPath: string; path: string }>> {
    // Les enfants sont dans le dossier qui a le même nom que le fichier parent sans .sy
    const folderPrefix = parentPath.replace(/\.sy$/, '') + '/';

    const resp = await this.client.request('/api/query/sql', {
      stmt: `SELECT id, hpath, path FROM blocks WHERE type='d' AND box='${box}' AND path LIKE '${folderPrefix}%' ORDER BY path DESC`
    });

    return (resp?.data ?? []).map((r: any) => ({
      id: r.id,
      hPath: r.hpath,
      path: r.path
    }));
  }
}
