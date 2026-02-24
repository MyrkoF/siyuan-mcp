/**
 * Document Service
 * Full CRUD for SiYuan documents via /api/filetree/*
 *
 * Endpoints used:
 * - GET  /api/export/exportMdContent   → clean Markdown content
 * - POST /api/filetree/renameDocByID   → rename
 * - POST /api/filetree/removeDocByID   → delete (one doc)
 * - POST /api/filetree/moveDocsByID    → move
 * - POST /api/query/sql                → find children before deletion
 *
 * deleteDocument behaviour:
 * - cascade:false (default) → if children exist: REFUSED with child list
 * - cascade:true            → deletes children depth-first then parent (all go to trash)
 * - dryRun:true             → returns what would be deleted WITHOUT touching anything
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
  dryRun?: boolean;
}

export class DocService {
  private client: SiyuanClient;

  constructor(client: SiyuanClient) {
    this.client = client;
  }

  // ==================== Public API ====================

  /**
   * Returns the Markdown content of a document.
   * Uses /api/export/exportMdContent (cleaner than getBlockKramdown).
   */
  async getDocument(id: string): Promise<DocContent> {
    if (!id?.trim()) throw new Error('id is required');

    const response = await this.client.request('/api/export/exportMdContent', {
      id: id.trim()
    });

    if (!response || response.code !== 0) {
      throw new Error(`Cannot read document "${id}": ${response?.msg ?? 'unknown error'}`);
    }

    return {
      id,
      hPath: response.data?.hPath ?? '',
      content: response.data?.content ?? ''
    };
  }

  /**
   * Renames a document.
   * Uses /api/filetree/renameDocByID.
   */
  async renameDocument(id: string, title: string): Promise<void> {
    if (!id?.trim()) throw new Error('id is required');
    if (!title?.trim()) throw new Error('title is required');

    const response = await this.client.request('/api/filetree/renameDocByID', {
      id: id.trim(),
      title: title.trim()
    });

    if (!response || response.code !== 0) {
      throw new Error(`Cannot rename document "${id}": ${response?.msg ?? 'unknown error'}`);
    }
  }

  /**
   * Deletes a document (sends to SiYuan trash — recoverable).
   *
   * cascade:false (default) — if children exist, REFUSES and lists them.
   *                           Prevents silent orphaning.
   * cascade:true            — deletes all children depth-first, then the parent.
   *                           Everything goes to trash (recoverable).
   * dryRun:true             — returns what WOULD be deleted without touching anything.
   *
   * @param id      — Block ID of the document to delete
   * @param cascade — false: refuse if children | true: recursive deletion
   * @param dryRun  — true: preview only, no actual deletion
   */
  async deleteDocument(id: string, cascade: boolean = false, dryRun: boolean = false): Promise<DocDeleteResult> {
    if (!id?.trim()) throw new Error('id is required');

    const docId = id.trim();

    // 1. Fetch document info (path + notebook)
    const info = await this.fetchDocInfo(docId);
    if (!info) {
      throw new Error(`Document "${docId}" not found`);
    }

    // 2. Find all descendants
    const children = await this.fetchDescendants(info.box, info.path);

    // 3. If children exist and cascade is off → explicit refusal
    if (children.length > 0 && !cascade) {
      const list = children.map(c => `  • "${c.hPath}" (${c.id})`).join('\n');
      throw new Error(
        `Deletion refused: document has ${children.length} child(ren).\n` +
        `Use cascade:true to delete recursively, or move the children first.\n` +
        `Children:\n${list}`
      );
    }

    // 4. Build the list of children to delete (sorted deepest-first)
    const sortedChildren = [...children].sort(
      (a, b) => b.path.split('/').length - a.path.split('/').length
    );
    const deletedChildren: Array<{ id: string; hPath: string }> = cascade
      ? sortedChildren.map(c => ({ id: c.id, hPath: c.hPath }))
      : [];

    // 5. Dry run: return preview without touching anything
    if (dryRun) {
      return { id: docId, deletedChildren, childCount: deletedChildren.length, dryRun: true };
    }

    // 6. Cascade: delete children deepest-first
    if (cascade && sortedChildren.length > 0) {
      for (const child of sortedChildren) {
        const resp = await this.client.request('/api/filetree/removeDocByID', { id: child.id });
        if (!resp || resp.code !== 0) {
          throw new Error(
            `Failed to delete child "${child.hPath}" (${child.id}): ${resp?.msg ?? 'unknown error'}`
          );
        }
      }
    }

    // 7. Delete the parent
    const response = await this.client.request('/api/filetree/removeDocByID', { id: docId });

    if (!response || response.code !== 0) {
      throw new Error(
        `Cannot delete document "${docId}": ${response?.msg ?? 'unknown error'}`
      );
    }

    return { id: docId, deletedChildren, childCount: deletedChildren.length };
  }

  /**
   * Moves one or more documents to a target parent.
   * Uses /api/filetree/moveDocsByID.
   *
   * @param fromIds — IDs of documents to move (at least 1)
   * @param toId    — target parent document ID OR target notebook ID
   */
  async moveDocuments(fromIds: string[], toId: string): Promise<void> {
    if (!fromIds?.length) throw new Error('At least one fromId is required');
    if (!toId?.trim()) throw new Error('toId is required');

    const response = await this.client.request('/api/filetree/moveDocsByID', {
      fromIDs: fromIds,
      toID: toId.trim()
    });

    if (!response || response.code !== 0) {
      throw new Error(`Cannot move documents: ${response?.msg ?? 'unknown error'}`);
    }
  }

  // ==================== Private helpers ====================

  /**
   * Fetches document info via SQL (box, path, hpath).
   * Returns null if the document does not exist.
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
   * Finds all descendant documents via SQL.
   * Uses the path prefix (parent.sy → parent/).
   *
   * @param box        — notebook ID
   * @param parentPath — parent path (e.g. "/foo/bar.sy")
   */
  private async fetchDescendants(
    box: string,
    parentPath: string
  ): Promise<Array<{ id: string; hPath: string; path: string }>> {
    // Children live in the folder named after the parent file (without .sy extension)
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
