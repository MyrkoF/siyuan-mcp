import { createSiyuanClient } from '../siyuanClient';
import logger from '../logger';

// Minimal pagination type (replaces deleted interfaces/index.ts dependency)
interface PaginationOptions {
  offset?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ── Static guide resources ────────────────────────────────────────────────────
const STATIC_GUIDES: Record<string, { name: string; description: string; content: string }> = {
  guide: {
    name: 'SiYuan MCP v2 — Object Model & Rules',
    description: 'SiYuan object types, IDs, and critical rules for correct tool use',
    content: `# SiYuan MCP v2 — Object Model & Rules

## Object Types

- **Notebook**: top-level container. Get IDs: list_notebooks or siyuan_sql
- **Document**: root block (type='d'). Identified by block ID.
  Read content: siyuan_sql("SELECT markdown FROM blocks WHERE id='docId'")
- **Block**: content unit inside a document (paragraph, heading, list, code, table…).
  Read: siyuan_sql. Write: insert_block / update_block / batch_block_ops.
- **Attribute View (AV)**: typed database stored in JSON files (NOT in SQLite).
  Has entries (rows) and typed fields (columns). NEVER use SQL for AV data.
  Read: read_database(id). Write: write_db_rows / update_db_cells / delete_db_rows.

## Critical Rules

1. DELETE document → delete_document(id), NEVER batch_block_ops delete
2. DELETE content block → batch_block_ops({action:"delete", id}), NEVER delete_document
3. delete_document on a parent does NOT cascade by default — set cascade:true
4. AV fields: identify by NAME using the field names from read_database, not by index
5. AV select field is stored internally as mSelect (array) — provide as string, MCP converts
6. AV isDetached:true = standalone entry with no linked document
7. SQL cannot see AV data — always use read_database for typed field values

## Getting IDs

- Notebook IDs : list_notebooks → id, or siyuan_sql("SELECT DISTINCT box FROM blocks")
- Document IDs : siyuan_sql("SELECT id, content FROM blocks WHERE type='d'")
- Block IDs    : siyuan_sql("SELECT id FROM blocks WHERE root_id='docId'")
- AV DB IDs    : read_database(mode:"list") → id, or workspace_map
- AV entry IDs : read_database(id) → entries[].id
- AV field IDs : read_database(id) → fields[].id

## AV Field Value Formats (for write_db_rows / update_db_cells)

  text      → "plain text"
  number    → 42
  select    → "Option Name"          (MCP auto-converts to mSelect)
  mSelect   → ["Option1", "Option2"]
  date      → 1704067200000          (Unix timestamp ms)
  checkbox  → true | false
  url       → "https://example.com"
  email     → "user@example.com"
  phone     → "+1-555-0100"
`,
  },
  'sql-schema': {
    name: 'SiYuan SQL Schema & Examples',
    description: 'SQLite table schema and example queries for use with siyuan_sql tool',
    content: `# SiYuan SQL Schema

## Table: blocks (main table — all content lives here)

| Column     | Type    | Description |
|-----------|---------|-------------|
| id        | TEXT PK | Block ID (format: YYYYMMDDHHmmss-xxxxxxx) |
| parent_id | TEXT    | Parent block ID |
| root_id   | TEXT    | Document (root) block ID |
| box       | TEXT    | Notebook ID |
| path      | TEXT    | File path within notebook |
| type      | TEXT    | Block type: d=document, p=paragraph, h=heading, l=list, i=listItem, c=code, t=table, b=blockquote, s=superBlock, html, m=math, video, audio, widget, iframe, query_embed, tb=thematicBreak |
| subtype   | TEXT    | Subtype (h1-h6 for headings, o/u/t for lists) |
| content   | TEXT    | Plain text content (no markup) |
| markdown  | TEXT    | Markdown/Kramdown source |
| tag       | TEXT    | Tags (space-separated #tag format) |
| name      | TEXT    | Named block name |
| alias     | TEXT    | Block aliases |
| memo      | TEXT    | Block memo/comment |
| length    | INTEGER | Content length |
| hash      | TEXT    | Content hash |
| created   | TEXT    | Creation time (YYYYMMDDHHmmss) |
| updated   | TEXT    | Last update time (YYYYMMDDHHmmss) |
| ial       | TEXT    | Inline attribute list (key="value" pairs) |
| sort      | INTEGER | Sort order |
| fcontent   | TEXT   | First child content (for list items) |

## Example Queries

### List all documents
SELECT id, content, box, path, created, updated
FROM blocks WHERE type = 'd'
ORDER BY updated DESC

### Search by content
SELECT id, content, root_id, type
FROM blocks WHERE content LIKE '%search term%'
LIMIT 20

### Get all blocks in a document
SELECT id, type, subtype, content, parent_id
FROM blocks WHERE root_id = '20260101120000-abcdefg'
ORDER BY sort

### List documents in a notebook
SELECT id, content, path, updated
FROM blocks WHERE type = 'd' AND box = 'notebookId'
ORDER BY path

### Find blocks with a specific tag
SELECT id, content, root_id, tag
FROM blocks WHERE tag LIKE '%#mytag%'

### Find headings in a document
SELECT id, content, subtype
FROM blocks WHERE root_id = 'docId' AND type = 'h'
ORDER BY sort

### Get backlinks (blocks referencing a target)
SELECT id, content, root_id
FROM blocks WHERE markdown LIKE '%((targetBlockId))%'

### Count documents per notebook
SELECT box, COUNT(*) as doc_count
FROM blocks WHERE type = 'd'
GROUP BY box

### Recent documents (last 7 days)
SELECT id, content, updated
FROM blocks WHERE type = 'd'
AND updated > strftime('%Y%m%d%H%M%S', 'now', '-7 days')
ORDER BY updated DESC

### Find code blocks by language
SELECT id, content, markdown
FROM blocks WHERE type = 'c' AND markdown LIKE '%\`\`\`python%'
LIMIT 10
`,
  },
  workflows: {
    name: 'SiYuan MCP v2 — CRUD Workflows',
    description: 'Step-by-step tool sequences for common operations',
    content: `# SiYuan MCP v2 — CRUD Workflows

## READ / BROWSE

Browse workspace:
  workspace_map                                      → notebooks, docs, database IDs
  siyuan_sql("SELECT id, content FROM blocks WHERE type='d' AND box='nbId'")  → docs in a notebook
  siyuan_sql("SELECT markdown FROM blocks WHERE id='docId'")                  → document content

Search notes:
  siyuan_sql("SELECT id, content, root_id FROM blocks WHERE content LIKE '%term%' LIMIT 20")

Read a database:
  read_database(mode:"list")                         → all databases with IDs
  read_database(id)                                  → full data: fields + entries
  read_database(id, filter:{field:"Status", value:"In Progress"})  → filtered entries

---

## CREATE

Create notebook:
  list_notebooks(name:"My Notebook")

Create document:
  list_notebooks                                     → get notebookId
  create_document(notebook, path:"/MyDoc", title:"My Doc", content:"# Hello")
  Subdocuments: path:"/Parent/Child" (SiYuan creates intermediate levels)

Add content to a document:
  insert_block(content:"# New Section", parentID:docId)

Create database entry:
  read_database(id)                                  → get field IDs
  write_db_rows(avId, rows:[{
    name: "Entry title",
    values: [{fieldId:"xxx", type:"select", content:"Active"}]
  }])

Create database under an existing document:
  create_document(notebook, path, title)             → returns doc block ID
  create_database(notebookId, name:"My DB",
    parentDocId: "<doc block ID from step above>",
    fields:[
      {name:"Status", type:"select"},
      {name:"Priority", type:"select"},
      {name:"Due", type:"date"},
      {name:"Done", type:"checkbox"}
  ])
  IMPORTANT: Always pass parentDocId when the DB should live under a specific document.
  Without parentDocId the DB page is created at notebook root (orphaned).
  Note: primary Name field is auto-created. Do NOT include "block" in fields.

---

## UPDATE

Update block content:
  update_block(id, content:"new markdown")

Update database entry:
  read_database(id)                                  → get entryId + fieldIds
  update_db_cells(avId, updates:[{
    entryId: "xxx",
    changes: [{fieldId:"yyy", type:"select", content:"Done"}]
  }])

Rename document:
  update_document(id, title:"New Title")

Replace document content:
  update_document(id, content:"# Completely new content")

Add/remove database fields:
  manage_db_fields(avId, action:"add", name:"Notes", type:"text")
  manage_db_fields(avId, action:"remove", fieldId:"xxx")

Set block metadata:
  set_block_attrs(id, attrs:{"custom-status":"reviewed"})

---

## DELETE

Delete document:
  delete_document(id)
  With children: delete_document(id, cascade:true)
  Preview first: delete_document(id, dryRun:true)

Delete blocks:
  batch_block_ops(operations:[
    {action:"delete", id:"blockId1"},
    {action:"delete", id:"blockId2"}
  ])

Delete database entries:
  delete_db_rows(avId, entryIds:["id1","id2"])

---

## BATCH OPERATIONS

Multiple block operations in one call:
  batch_block_ops(operations:[
    {action:"insert", content:"# Section 1", parentID:docId},
    {action:"insert", content:"Paragraph text", parentID:docId},
    {action:"update", id:existingBlockId, content:"Updated text"},
    {action:"delete", id:oldBlockId}
  ])

Multiple database entries:
  write_db_rows(avId, rows:[
    {name:"Entry 1", values:[...]},
    {name:"Entry 2", values:[...]},
    {name:"Entry 3", values:[...]}
  ])
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
        description: `Notebook: ${notebook.name || 'Unnamed Notebook'}`,
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
            description: `Document: ${doc.path}`,
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
              description: `Document: ${doc.path} (${notebook.name})`,
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
          
          // searchNotes now returns any[] directly
          const searchResults = searchResponse;
          
          for (const result of searchResults) {
            resources.push({
              uri: `siyuan://block/${result.id}`,
              name: (result.content || result.markdown || '').substring(0, 100) + '...' || 'Untitled Block',
              description: `Block: ${result.type || 'block'} - ${(result.content || result.markdown || '').substring(0, 200)}...`,
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

  // Return only static guide resources (no SiYuan API calls — safe for startup)
  listStaticResources(): MCPResource[] {
    return Object.entries(STATIC_GUIDES).map(([key, guide]) => ({
      uri: `siyuan://static/${key}`,
      name: guide.name,
      description: guide.description,
      mimeType: 'text/markdown',
      metadata: { type: 'static' }
    }));
  }

  // Return static guides + notebooks from SiYuan (for MCP ListResources at startup).
  // If SiYuan is unavailable, falls back to static guides only — no error thrown.
  async listStartupResources(): Promise<MCPResource[]> {
    const resources = this.listStaticResources();
    try {
      const notebooks = await this.discoverNotebooks({});
      resources.push(...notebooks);
    } catch (error) {
      logger.warn({ error }, 'SiYuan unavailable at startup — returning static resources only');
    }
    return resources;
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
