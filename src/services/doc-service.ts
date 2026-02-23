/**
 * Document Service
 * CRUD complet sur les documents SiYuan via /api/filetree/*
 *
 * Endpoints utilisés :
 * - GET  /api/export/exportMdContent   → contenu Markdown propre
 * - POST /api/filetree/renameDocByID   → renommer
 * - POST /api/filetree/removeDocByID   → supprimer
 * - POST /api/filetree/moveDocsByID    → déplacer
 */

import { SiyuanClient } from '../siyuanClient';

export interface DocContent {
  id: string;
  hPath: string;
  content: string;
}

export class DocService {
  private client: SiyuanClient;

  constructor(client: SiyuanClient) {
    this.client = client;
  }

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
   * Supprime un document (envoi dans la corbeille).
   * Utilise /api/filetree/removeDocByID.
   */
  async deleteDocument(id: string): Promise<void> {
    if (!id?.trim()) throw new Error('id est requis');

    const response = await this.client.request('/api/filetree/removeDocByID', {
      id: id.trim()
    });

    if (!response || response.code !== 0) {
      throw new Error(`Impossible de supprimer le document "${id}": ${response?.msg ?? 'erreur inconnue'}`);
    }
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
}
