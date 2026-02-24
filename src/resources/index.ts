import { createSiyuanClient } from '../siyuanClient';
import logger from '../logger';
import { PaginationOptions } from '../interfaces/index.js';

// ── Static guide resources ────────────────────────────────────────────────────
const STATIC_GUIDES: Record<string, { name: string; description: string; content: string }> = {
  guide: {
    name: 'SiYuan MCP — Object Model & Rules',
    description: 'SiYuan object types, IDs, and critical rules for correct tool use (validated by testing)',
    content: `# SiYuan MCP — Object Model & Rules

## Object Types

- **Notebook**: top-level container. Has an ID. Get IDs: list_notebooks
- **Document**: root block (type=d). Identified by rootID = the document block ID.
  Browse: docs_list(notebookId, path?) | Read full content: doc_get(id)
  docs_list returns ONE level at a time (not recursive). Path defaults to "/".
- **Block**: content unit inside a document (paragraph, heading, list item, code block, table, etc.)
  Identified by blockID. CRUD: blocks_get / blocks_create / blocks_update / blocks_delete
  blocks_create needs parentID = the parent block ID (usually the document rootID).
- **Attribute View (AV)**: typed database stored SEPARATELY from documents (not in SQLite).
  Has rows (each with a unique rowId) and typed columns (each with a unique keyId and a name).
  NEVER use SQL to read AV column values — SQL cannot see them. Use av_render_database.

## Critical Rules (Tested & Confirmed)

1. DELETE document      → doc_delete(id)       ← NEVER blocks_delete for documents
2. DELETE content block → blocks_delete(id)    ← NEVER doc_delete for blocks
3. doc_delete on a parent does NOT cascade-delete children — children move to notebook root
4. AV columns: ALWAYS identify by NAME using findColumn(), NEVER by array index (unstable)
5. AV select column is stored internally as mSelect (array) — always provide as string, MCP converts
6. AV relation.blockIDs = row IDs (not document IDs — do not confuse)
7. AV isDetached:true = standalone row with no linked document — cannot be used as ((blockRef))
8. Always wrap av_render_database in try/catch — database may be in trash

## Getting IDs

- Notebook IDs    : list_notebooks → notebooks[].id
- Document IDs    : docs_list(notebookId) → files[].id  OR  search_content(query) → rootID
- Block IDs       : doc_get(docId) returns kramdown with block IDs, or search_content
- AV database IDs : av_list_databases([nameFilter:"DB-"]) → id field
- AV row IDs      : av_render_database(avId) → data.view.rows[].id
- AV column IDs   : av_render_database(avId) → data.view.columns[].id  (prefer NAME)

## AV Column Value Formats for av_create_row / av_update_row

  text      → "plain text"
  number    → 42
  select    → "Option Name"          (single string — MCP auto-converts to mSelect internally)
  mSelect   → ["Option1", "Option2"] (array of strings)
  date      → 1704067200000          (Unix timestamp in milliseconds)
  checkbox  → true | false
  url       → "https://example.com"
  email     → "user@example.com"
  phone     → "+1-555-0100"

## AV renderAttributeView Response Structure

  data.name              → database name
  data.id                → database ID (avId)
  data.view.columns[]    → [{ id, name, type, ... }]
  data.view.rows[]       → [{ id, cells: [{ value: { keyID, type, ... } }] }]

  cell.value.block.content   → row title (primary key)
  cell.value.mSelect[0].content → select value
  cell.value.text.content    → text value
  cell.value.number.content  → number value
  cell.value.checkbox.checked → boolean
  cell.value.date.content    → timestamp ms
  cell.value.relation.blockIDs → related row IDs

## What Does NOT Work (Confirmed by Testing)

- appendAttributeViewDetachedBlocksWithValues → silently returns code:0 but does nothing
- addAttributeViewKey HTTP API → silently returns code:0 but adds no column
- SQL queries on AV custom columns (Status, Priority, etc.) → returns empty / wrong data
- Adding columns to AV via HTTP API → must edit the JSON file directly (av_create_database handles this)
`,
  },
  workflows: {
    name: 'SiYuan MCP — CRUD Workflows',
    description: 'Validated step-by-step tool sequences for common Create / Read / Update / Delete operations',
    content: `# SiYuan MCP — CRUD Workflows (Validated)

## READ / BROWSE

Browse workspace:
  list_notebooks                           → notebooks[].{id, name}
  → docs_list(notebookId)                  → files[].{id, name, path}  (root level)
  → docs_list(notebookId, path:"/Parent")  → files at that path
  → doc_get(docId)                         → full kramdown content

Search notes (choose one):
  search_content(query)                    full-text, returns matching blocks with IDs
  quick_text_search(text)                  fast, returns docs
  advanced_search({ query, notebook, type, ... })

Read a database:
  av_list_databases([nameFilter:"DB-"])    → [{id, name, columnCount, rowCount}]
  → av_render_database(avId)              → {name, id, view:{columns[], rows[]}}
  → av_query_database(avId, column:"Status", value:"In Progress")  client-side filter

---

## CREATE

Create notebook:
  create_notebook(name)

Create document in notebook:
  list_notebooks                           → get notebookId
  → docs_create(notebookId, path:"/MyDoc", title:"My Doc")
  path starts with "/" and is relative to notebook root.
  closed notebook → throws error (check notebook.closed before)

Create child document:
  create_subdocument(notebookId, parentPath:"/Parent", title:"Child")

Add content block to a document:
  doc_get(docId)                           → get rootID (= docId itself)
  → blocks_create(content:"# Heading", parentID:docId)

Create AV row (confirmed working):
  av_render_database(avId)                 → note column names
  → av_create_row(avId, name:"Row title", values:{
      Status: "In Progress",
      Priority: "High",
      Due: 1704067200000,
      Done: false
    })

Create AV database (confirmed working):
  list_notebooks                           → get notebookId
  → av_create_database(notebookId, name:"DB-MyDB", columns:[
      { name:"Name",     type:"block"    },  ← always include block as first column
      { name:"Status",   type:"select"   },
      { name:"Priority", type:"select"   },
      { name:"Due",      type:"date"     },
      { name:"Done",     type:"checkbox" },
      { name:"Notes",    type:"text"     }
    ])
  Returns avId — use immediately with other av_* tools.

---

## UPDATE

Update block content:
  blocks_update(blockId, content:"new markdown content")

Update AV cell values (confirmed working via batchSetAttributeViewBlockAttrs):
  av_render_database(avId)                 → find rowId + column names
  → av_update_row(avId, rowId, updates:{
      Status: "Done",
      Priority: "Low",
      Due: 1706745600000
    })
  Multiple columns updated in one call. Column identified by name (not index).

Rename document:
  doc_rename(docId, title:"New Title")

Move document:
  doc_move(fromIds:[docId], toId:newParentDocId)

Tags:
  get_all_tags()                           → all tags with counts
  manage_block_tags(blockId, operation:"add"|"remove"|"replace", tags:["t1","t2"])

---

## DELETE

Delete a document:
  doc_delete(docId)
  ⚠ Does NOT cascade-delete child documents — children move to notebook root with new IDs.
  Use recursively if you need to delete a tree.

Delete a content block:
  blocks_delete(blockId)                   ← paragraph, heading, list item, etc.
  NEVER use for documents.

Delete multiple blocks:
  batch_delete_blocks(blockIds:["id1","id2"])  ← not for documents

Delete AV rows (confirmed working via removeAttributeViewBlocks with srcIDs):
  av_delete_row(avId, rowIds:["id1","id2"])

---

## BATCH OPERATIONS

  batch_create_blocks(requests:[{content, parentID}, ...])
  batch_update_blocks(requests:[{id, content}, ...])
  batch_delete_blocks(blockIds:["id1","id2"])
  batch_search_queries(queries:["q1","q2"], limit:5)
`,
  },
};

// MCP资源类型定义
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  metadata?: Record<string, any>;
}

// 资源过滤器
export interface ResourceFilter {
  type?: 'document' | 'block' | 'notebook';
  notebook?: string;
  path?: string;
  query?: string;
  tags?: string[];
  dateRange?: {
    start?: Date;
    end?: Date;
  };
}



// 资源发现结果
export interface ResourceDiscoveryResult {
  resources: MCPResource[];
  total: number;
  hasMore: boolean;
  nextOffset?: number;
}

export class ResourceDirectory {
  private siyuanClient;

  constructor() {
    this.siyuanClient = createSiyuanClient({
      baseURL: process.env.SIYUAN_API_URL || process.env.SIYUAN_BASE_URL || undefined,
      token: process.env.SIYUAN_API_TOKEN || process.env.SIYUAN_TOKEN || '',
      autoDiscoverPort: true
    });
  }

  // 发现所有可用资源
  async discoverResources(
    filter: ResourceFilter = {},
    pagination: PaginationOptions = {}
  ): Promise<ResourceDiscoveryResult> {
    const { offset = 0, limit = 50, sortBy = 'updated', sortOrder = 'desc' } = pagination;
    
    try {
      const resources: MCPResource[] = [];
      let total = 0;

      // Always include static guide resources first
      if (!filter.type) {
        for (const [key, guide] of Object.entries(STATIC_GUIDES)) {
          resources.push({
            uri: `siyuan://static/${key}`,
            name: guide.name,
            description: guide.description,
            mimeType: 'text/markdown',
            metadata: { type: 'static' }
          });
          total += 1;
        }
      }

      // 根据过滤器类型获取不同的资源
      if (!filter.type || filter.type === 'notebook') {
        const notebooks = await this.discoverNotebooks(filter);
        resources.push(...notebooks);
        total += notebooks.length;
      }

      if (!filter.type || filter.type === 'document') {
        const documents = await this.discoverDocuments(filter, pagination);
        resources.push(...documents.resources);
        total += documents.total;
      }

      if (!filter.type || filter.type === 'block') {
        const blocks = await this.discoverBlocks(filter, pagination);
        resources.push(...blocks.resources);
        total += blocks.total;
      }

      // 排序
      const sortedResources = this.sortResources(resources, sortBy, sortOrder);
      
      // 分页
      const paginatedResources = sortedResources.slice(offset, offset + limit);
      
      return {
        resources: paginatedResources,
        total,
        hasMore: offset + limit < total,
        nextOffset: offset + limit < total ? offset + limit : undefined
      };

    } catch (error) {
      logger.error({ error, filter, pagination }, 'Failed to discover resources');
      throw error;
    }
  }

  // 发现笔记本资源
  private async discoverNotebooks(filter: ResourceFilter): Promise<MCPResource[]> {
    try {
      const response = await this.siyuanClient.request('/api/notebook/lsNotebooks', {});
      
      // 处理不同的响应格式
      let notebooks = [];
      if (response && response.data && response.data.notebooks) {
        notebooks = response.data.notebooks;
      } else if (response && Array.isArray(response.notebooks)) {
        notebooks = response.notebooks;
      } else if (Array.isArray(response)) {
        notebooks = response;
      } else if (response && response.data && Array.isArray(response.data)) {
        notebooks = response.data;
      }
      
      return notebooks.map((notebook: any) => ({
        uri: `siyuan://notebook/${notebook.id}`,
        name: notebook.name || 'Unnamed Notebook',
        description: `笔记本: ${notebook.name || 'Unnamed Notebook'}`,
        mimeType: 'application/x-siyuan-notebook',
        metadata: {
          type: 'notebook',
          id: notebook.id,
          icon: notebook.icon,
          sort: notebook.sort,
          closed: notebook.closed
        }
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to discover notebooks');
      return [];
    }
  }

  // 发现文档资源
  private async discoverDocuments(
    filter: ResourceFilter,
    pagination: PaginationOptions
  ): Promise<{ resources: MCPResource[]; total: number }> {
    try {
      const resources: MCPResource[] = [];
      let total = 0;

      if (filter.notebook) {
        // 获取指定笔记本的文档
        const docsResponse = await this.siyuanClient.documents.listDocs(
          filter.notebook
        );
        const docs = docsResponse.data || [];
        
        for (const doc of docs) {
          resources.push({
            uri: `siyuan://document/${doc.id}`,
            name: doc.name,
            description: `文档: ${doc.path}`,
            mimeType: 'application/x-siyuan-document',
            metadata: {
              type: 'document',
              id: doc.id,
              path: doc.path,
              notebook: filter.notebook,
              created: doc.created,
              updated: doc.updated,
              size: doc.size
            }
          });
        }
        total = docs.length;
      } else {
        // 获取所有笔记本的文档
        const notebooksResponse = await this.siyuanClient.request('/api/notebook/lsNotebooks', {});
        const notebooks = notebooksResponse.data?.notebooks || [];
        
        for (const notebook of notebooks) {
          const docsResponse = await this.siyuanClient.documents.listDocs(notebook.id);
        const docs = docsResponse.data || [];
          
          for (const doc of docs) {
            resources.push({
              uri: `siyuan://document/${doc.id}`,
              name: doc.name,
              description: `文档: ${doc.path} (${notebook.name})`,
              mimeType: 'application/x-siyuan-document',
              metadata: {
                type: 'document',
                id: doc.id,
                path: doc.path,
                notebook: notebook.id,
                notebookName: notebook.name,
                created: doc.created,
                updated: doc.updated,
                size: doc.size
              }
            });
          }
          total += docs.length;
        }
      }

      return { resources, total };
    } catch (error) {
      logger.error({ error, filter }, 'Failed to discover documents');
      return { resources: [], total: 0 };
    }
  }

  // 发现块资源
  private async discoverBlocks(
    filter: ResourceFilter,
    pagination: PaginationOptions
  ): Promise<{ resources: MCPResource[]; total: number }> {
    try {
      const resources: MCPResource[] = [];
      
      if (filter.query) {
        try {
          // 使用搜索API查找块
          const searchResponse = await this.siyuanClient.searchNotes(
            filter.query,
            pagination.limit || 20
          );
          
          // 处理搜索响应的不同格式
          let searchResults = [];
          if (searchResponse && searchResponse.data && searchResponse.data.blocks) {
            searchResults = searchResponse.data.blocks;
          } else if (Array.isArray(searchResponse)) {
            searchResults = searchResponse;
          } else if (searchResponse && Array.isArray(searchResponse.blocks)) {
            searchResults = searchResponse.blocks;
          }
          
          for (const result of searchResults) {
            resources.push({
              uri: `siyuan://block/${result.id}`,
              name: (result.content || result.markdown || '').substring(0, 100) + '...' || 'Untitled Block',
              description: `块: ${result.type || 'block'} - ${(result.content || result.markdown || '').substring(0, 200)}...`,
              mimeType: 'application/x-siyuan-block',
              metadata: {
                type: 'block',
                id: result.id,
                blockType: result.type,
                content: result.content || result.markdown,
                path: result.path,
                created: result.created,
                updated: result.updated
              }
            });
          }
          
          return { resources, total: searchResults.length };
        } catch (error) {
          // 完全禁用日志输出 - 用户不需要任何日志
          return { resources: [], total: 0 };
        }
      }

      return { resources: [], total: 0 };
    } catch (error) {
      logger.error({ error, filter }, 'Failed to discover blocks');
      return { resources: [], total: 0 };
    }
  }

  // 获取单个资源内容
  async getResourceContent(uri: string): Promise<string> {
    try {
      const { type, id } = this.parseResourceURI(uri);

      switch (type) {
        case 'static': {
          const guide = STATIC_GUIDES[id];
          if (!guide) throw new Error(`Unknown static guide: ${id}`);
          return guide.content;
        }

        case 'notebook':
          const notebooksResponse = await this.siyuanClient.request('/api/notebook/lsNotebooks', {});
          const notebooks = notebooksResponse.data?.notebooks || [];
          const notebook = notebooks.find((nb: any) => nb.id === id);
          return JSON.stringify(notebook, null, 2);
          
        case 'document':
          // 获取文档的所有块
          const docBlocks = await this.siyuanClient.request('/api/filetree/getDoc', { id });
          // 处理思源API响应格式
          const data = docBlocks?.data || docBlocks;
          return JSON.stringify(data, null, 2);
          
        case 'block':
          const block = await this.siyuanClient.blocks.getBlock(id);
          return block?.content || '';
          
        default:
          throw new Error(`Unsupported resource type: ${type}`);
      }
    } catch (error) {
      logger.error({ error, uri }, 'Failed to get resource content');
      throw error;
    }
  }

  // 搜索资源
  async searchResources(
    query: string,
    filter: ResourceFilter = {},
    pagination: PaginationOptions = {}
  ): Promise<ResourceDiscoveryResult> {
    const searchFilter = { ...filter, query };
    return await this.discoverResources(searchFilter, pagination);
  }

  // 获取资源元数据
  async getResourceMetadata(uri: string): Promise<Record<string, any>> {
    try {
      const { type, id } = this.parseResourceURI(uri);

      switch (type) {
        case 'static': {
          const guide = STATIC_GUIDES[id];
          return guide
            ? { type: 'static', name: guide.name, description: guide.description, mimeType: 'text/markdown' }
            : {};
        }

        case 'notebook':
          const notebooksResponse = await this.siyuanClient.request('/api/notebook/lsNotebooks', {});
          const notebooks = notebooksResponse.data?.notebooks || [];
          const notebook = notebooks.find((nb: any) => nb.id === id);
          return notebook || {};
          
        case 'document':
          const docInfo = await this.siyuanClient.request('/api/filetree/getDoc', { id });
          // 处理思源API响应格式
          return docInfo?.data || docInfo || {};
          
        case 'block':
          const block = await this.siyuanClient.blocks.getBlock(id);
          return block || {};
          
        default:
          return {};
      }
    } catch (error) {
      logger.error({ error, uri }, 'Failed to get resource metadata');
      return {};
    }
  }

  // 解析资源URI
  private parseResourceURI(uri: string): { type: string; id: string } {
    const match = uri.match(/^siyuan:\/\/(\w+)\/?(.*)$/);
    if (!match) {
      throw new Error(`Invalid resource URI: ${uri}`);
    }
    return { type: match[1], id: match[2] || '' };
  }

  // 排序资源
  private sortResources(
    resources: MCPResource[],
    sortBy: string,
    sortOrder: 'asc' | 'desc'
  ): MCPResource[] {
    return resources.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'created':
          const aCreated = a.metadata?.created || 0;
          const bCreated = b.metadata?.created || 0;
          comparison = aCreated - bCreated;
          break;
        case 'updated':
          const aUpdated = a.metadata?.updated || 0;
          const bUpdated = b.metadata?.updated || 0;
          comparison = aUpdated - bUpdated;
          break;
        default:
          comparison = 0;
      }
      
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }

  // 获取资源统计信息
  async getResourceStats(): Promise<{
    notebooks: number;
    documents: number;
    blocks: number;
    totalSize: number;
  }> {
    try {
      const notebooksResponse = await this.siyuanClient.request('/api/notebook/lsNotebooks', {});
      const notebooks = notebooksResponse.data?.notebooks || [];
      let documents = 0;
      let totalSize = 0;

      for (const notebook of notebooks) {
        const docsResponse = await this.siyuanClient.documents.listDocs(notebook.id);
        const docs = docsResponse.data || [];
        documents += docs.length;
        totalSize += docs.reduce((sum: number, doc: any) => sum + (doc.size || 0), 0);
      }

      return {
        notebooks: notebooks.length,
        documents,
        blocks: 0, // 块数量需要通过搜索API获取，这里暂时设为0
        totalSize
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get resource stats');
      return { notebooks: 0, documents: 0, blocks: 0, totalSize: 0 };
    }
  }
}

// 创建默认的资源目录实例
export const resourceDirectory = new ResourceDirectory();
