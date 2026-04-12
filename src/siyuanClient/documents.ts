import { SiyuanClient } from './index';

export interface DocumentOperations {
  // Core document operations
  getDoc(id: string): Promise<any>;
  createDoc(notebook: string, path: string, title: string, markdown?: string): Promise<any>;
  updateDoc(id: string, markdown: string): Promise<any>;
  deleteDoc(id: string): Promise<any>;
  // Document tree
  getDocTree(notebook: string): Promise<any>;
  // Search
  searchDocs(query: string): Promise<any>;
  // Recursive search and batch operations (legacy v1)
  recursiveSearchDocs(query: string, notebook?: string, options?: any): Promise<any>;
  batchReadAllDocuments(notebookId: string, options?: any): Promise<any[]>;
  listDocs(notebook: string, path?: string): Promise<any>;
  buildDocumentTree(documentIds: string[], maxDepth?: number): Promise<any[]>;
  getChildDocuments(parentId: string, maxDepth?: number): Promise<any[]>;
  batchGetDocuments(documentIds: string[], options?: any): Promise<any>;
}

export function createDocumentOperations(client: SiyuanClient): DocumentOperations {
  return {
    async getDoc(id: string) {
      return await client.request('/api/block/getBlockKramdown', { id });
    },

    async createDoc(notebook: string, path: string, title: string, markdown: string = '') {
      if (!notebook || typeof notebook !== 'string') {
        throw new Error('createDoc failed: a valid notebook ID is required');
      }

      // Validate notebook exists (fix #1: trim IDs before comparison)
      try {
        const notebooksResponse = await client.request('/api/notebook/lsNotebooks');
        if (notebooksResponse.code !== 0) {
          throw new Error(`Failed to list notebooks: ${notebooksResponse.msg}`);
        }

        const notebooks = notebooksResponse.data?.notebooks || [];
        const notebookTrimmed = notebook.trim();
        const targetNotebook = notebooks.find((nb: any) => nb.id.trim() === notebookTrimmed);

        if (!targetNotebook) {
          throw new Error(`createDoc failed: notebook ${notebook} not found. Create the notebook first or use a valid notebook ID`);
        }

        if (targetNotebook.closed) {
          throw new Error(`createDoc failed: notebook ${notebook} is closed. Open it first`);
        }
      } catch (error) {
        if (error instanceof Error) {
          throw error;
        }
        throw new Error(`Notebook validation error: ${error}`);
      }

      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        throw new Error('createDoc failed: a valid document title is required');
      }
      
      const createResponse = await client.request('/api/filetree/createDocWithMd', {
        notebook,
        path: path || '/',
        markdown: markdown || ''
      });
      
      if (createResponse.code === 0) {
        // Build a more useful return object
        return {
          ...createResponse,
          data: {
            id: (typeof createResponse.data === 'string' ? createResponse.data : createResponse.data?.id) || `${Date.now().toString().substring(0, 14)}-${Math.random().toString(36).substring(2, 9)}`,
            notebook,
            path: path || '/',
            title: title.trim(),
            markdown: markdown || '',
            created: new Date().toISOString()
          }
        };
      }
      
      return createResponse;
    },

    async updateDoc(id: string, markdown: string) {
      return await client.request('/api/block/updateBlock', {
        id,
        data: markdown,
        dataType: 'markdown'
      });
    },

    async deleteDoc(id: string) {
      return await client.request('/api/block/deleteBlock', { id });
    },

    async getDocTree(notebook: string) {
      return await client.request('/api/filetree/getDoc', { 
        notebook,
        path: '/'
      });
    },

    async searchDocs(query: string) {
      return await client.request('/api/search/searchBlock', {
        query,
        types: {
          document: true
        }
      });
    },

    async listDocs(notebook: string, path?: string) {
      return await client.request('/api/filetree/listDocsByPath', {
        notebook,
        path: path || '/'
      });
    },

    /**
     * Recursive document search (supports multi-level traversal)
     */
    async recursiveSearchDocs(
      query: string, 
      notebook?: string, 
      options: {
        maxDepth?: number;
        includeContent?: boolean;
        fuzzyMatch?: boolean;
        limit?: number;
      } = {}
    ) {
      const {
        maxDepth = 10,
        includeContent = false,
        fuzzyMatch = true,
        limit = 50
      } = options;

      try {
        // Build recursive search params
        const searchData: any = {
          query: fuzzyMatch ? `*${query}*` : query,
          method: fuzzyMatch ? 0 : 1,
          types: {
            document: true,
            heading: true,
            paragraph: includeContent,
            list: includeContent,
            listItem: includeContent
          },
          groupBy: 1,
          orderBy: 0,
          page: 1,
          pageSize: limit
        };

        if (notebook) {
          searchData.paths = [`/data/${notebook}`];
        }

        // Execute base search
        const searchResult = await client.request('/api/search/searchBlock', searchData);
        
        if (!searchResult.data?.blocks) {
          return { code: 0, data: { blocks: [], documentsTree: [] }, msg: 'Search complete, no results' };
        }

        // Collect all related document IDs
        const documentIds = [...new Set(searchResult.data.blocks.map((block: any) => String(block.root_id)))] as string[];
        
        // Build document tree structure
        const documentsTree = await this.buildDocumentTree(documentIds, maxDepth);
        
        // If content is needed, batch-fetch document details
        let documentsContent = [];
        if (includeContent) {
          documentsContent = await this.batchGetDocuments(documentIds.slice(0, 20));
        }

        return {
          code: 0,
          data: {
            blocks: searchResult.data.blocks,
            documentsTree,
            documentsContent,
            totalDocuments: documentIds.length,
            searchOptions: options
          },
          msg: `Recursive search complete, found ${documentIds.length} related documents`
        };

      } catch (error: any) {
        throw new Error(`Recursive search failed: ${error.message}`);
      }
    },

    /**
     * Build document tree structure
     */
    async buildDocumentTree(documentIds: string[], maxDepth: number = 10): Promise<any[]> {
      const documentTree: any[] = [];
      
      for (const docId of documentIds) {
        try {
          const docInfo = await client.request('/api/block/getBlockInfo', { id: docId });
          if (docInfo.code === 0) {
            const treeNode: any = {
              id: docId,
              title: docInfo.data.title || 'Untitled',
              notebook: docInfo.data.box,
              path: docInfo.data.path,
              children: []
            };

            // Recursively get child documents
            if (maxDepth > 0) {
              treeNode.children = await this.getChildDocuments(docId, maxDepth - 1);
            }

            documentTree.push(treeNode);
          }
        } catch (error) {
          // Silent - no log output
        }
      }

      return documentTree;
    },

    /**
     * Get child documents
     */
    async getChildDocuments(parentId: string, remainingDepth: number): Promise<any[]> {
      if (remainingDepth <= 0) return [];

      try {
        const childBlocks = await client.request('/api/block/getChildBlocks', { id: parentId });
        const childDocs: any[] = [];

        if (childBlocks.code === 0 && childBlocks.data) {
          for (const block of childBlocks.data) {
            if (block.type === 'NodeDocument') {
              const childDoc = {
                id: block.id,
                title: block.content || 'Untitled',
                type: block.type,
                children: await this.getChildDocuments(block.id, remainingDepth - 1)
              };
              childDocs.push(childDoc);
            }
          }
        }

        return childDocs;
      } catch (error) {
        // Silent - no log output: ${error}\n`);
        return [];
      }
    },

    /**
     * Batch get document content
     */
    async batchGetDocuments(documentIds: string[]): Promise<any[]> {
      const batchSize = 5;
      const results: any[] = [];

      for (let i = 0; i < documentIds.length; i += batchSize) {
        const batch = documentIds.slice(i, i + batchSize);
        const batchPromises = batch.map(async (id) => {
          try {
            const doc = await this.getDoc(id);
            return doc.code === 0 ? { id, ...doc.data } : null;
          } catch (error) {
            // Silent - no log output
            return null;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults.filter(doc => doc !== null));

        // Small delay to avoid API rate limiting
        if (i + batchSize < documentIds.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return results;
    },

    /**
     * Batch read all documents in notebook (legacy v1, kept for interface compat)
     */
    async batchReadAllDocuments(
      notebookId: string,
      options: { maxDepth?: number; includeContent?: boolean } = {}
    ): Promise<any[]> {
      const docTree = await this.getDocTree(notebookId);
      if (docTree.code !== 0) return [];
      const collectIds = (nodes: any[], depth = 0): string[] => {
        if (depth >= (options.maxDepth ?? 10)) return [];
        const ids: string[] = [];
        for (const n of nodes || []) {
          if (n.type === 'NodeDocument') ids.push(n.id);
          if (n.children?.length) ids.push(...collectIds(n.children, depth + 1));
        }
        return ids;
      };
      const ids = collectIds(docTree.data);
      if (!options.includeContent) return ids.map(id => ({ id, notebookId }));
      const results: any[] = [];
      for (const id of ids) {
        try {
          const doc = await this.getDoc(id);
          if (doc.code === 0) results.push({ id, notebookId, ...doc.data });
        } catch {}
      }
      return results;
    }
  };
}
