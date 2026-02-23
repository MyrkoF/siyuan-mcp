#!/usr/bin/env node
import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import logger from './logger.js';
import { createSiyuanClient } from './siyuanClient';
import { contextManager } from './contextStore/manager';
import { resourceDirectory } from './resources';
import { promptTemplateManager } from './prompts';
import { createPortDiscovery } from './utils/portDiscovery';

import { getAllMergedTools, handleMergedTool } from './tools/Tools.js';

const server = new Server(
  {
    name: 'mcp_server_siyuan',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// 创建思源客户端
// Les env vars sont résolues dans createSiyuanClient :
//   SIYUAN_API_URL (ou SIYUAN_BASE_URL) pour l'URL
//   SIYUAN_API_TOKEN (ou SIYUAN_TOKEN) pour le token
const siyuanClient = createSiyuanClient({
  autoDiscoverPort: true
});

// 注册工具
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'system_health',
        description: 'Check SiYuan connection status and server health',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'system_discover_ports',
        description: 'Auto-discover the SiYuan port (scans 6806–6808)',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'blocks_get',
        description: 'Get block content (kramdown) by ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Block ID' }
          },
          required: ['id']
        }
      },
      {
        name: 'blocks_create',
        description: 'Insert a new block',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'Block content (Markdown)' },
            parentID: { type: 'string', description: 'Parent block ID (optional)' },
            previousID: { type: 'string', description: 'Previous sibling block ID (optional)' }
          },
          required: ['content']
        }
      },
      {
        name: 'blocks_update',
        description: 'Update a block content by ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Block ID' },
            content: { type: 'string', description: 'New block content (Markdown)' }
          },
          required: ['id', 'content']
        }
      },
      {
        name: 'blocks_delete',
        description: 'Delete a content block (paragraph, heading, list item, code block, etc.) by ID. Do NOT use for documents — use doc_delete instead.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Block ID' }
          },
          required: ['id']
        }
      },
      {
        name: 'blocks_move',
        description: 'Move a block to a new position',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Block ID' },
            parentID: { type: 'string', description: 'New parent block ID' },
            previousID: { type: 'string', description: 'Previous sibling block ID (optional)' }
          },
          required: ['id', 'parentID']
        }
      },
      {
        name: 'docs_create',
        description: 'Create a new document in a notebook',
        inputSchema: {
          type: 'object',
          properties: {
            notebook: { type: 'string', description: 'Notebook ID' },
            path: { type: 'string', description: 'Document path' },
            title: { type: 'string', description: 'Document title' },
            content: { type: 'string', description: 'Document content (optional)' }
          },
          required: ['notebook', 'path', 'title']
        }
      },
      {
        name: 'docs_list',
        description: 'List documents in a notebook by path',
        inputSchema: {
          type: 'object',
          properties: {
            notebook: { type: 'string', description: 'Notebook ID' },
            path: { type: 'string', description: 'Path (optional, defaults to root)' }
          },
          required: ['notebook']
        }
      },
      {
        name: 'assets_upload',
        description: 'Upload a file asset to the workspace',
        inputSchema: {
          type: 'object',
          properties: {
            file: { type: 'string', description: 'File path or base64-encoded content' },
            assetsDirPath: { type: 'string', description: 'Assets directory path' }
          },
          required: ['file', 'assetsDirPath']
        }
      },
      {
        name: 'assets_list',
        description: 'List assets attached to a document',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Document ID' },
            type: { type: 'string', enum: ['all', 'images'], description: 'Asset type: "all" or "images"', default: 'all' }
          },
          required: ['id']
        }
      },
      {
        name: 'assets_unused',
        description: 'Find unused asset files in the workspace',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'assets_missing',
        description: 'Find missing (referenced but absent) asset files',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'assets_rename',
        description: 'Rename an asset file',
        inputSchema: {
          type: 'object',
          properties: {
            oldPath: { type: 'string', description: 'Original path' },
            newPath: { type: 'string', description: 'New path' }
          },
          required: ['oldPath', 'newPath']
        }
      },
      {
        name: 'assets_ocr',
        description: 'OCR text recognition on an image asset',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Image path' }
          },
          required: ['path']
        }
      },
      {
        name: 'context_session_create',
        description: 'Create a new context session',
        inputSchema: {
          type: 'object',
          properties: {
            userId: { type: 'string', description: 'User ID (optional)' }
          },
          required: []
        }
      },
      {
        name: 'context_session_get',
        description: 'Get context session data',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            key: { type: 'string', description: 'Specific data key (optional)' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'context_session_update',
        description: 'Update context session data',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            key: { type: 'string', description: 'Data key' },
            value: { description: 'Data value' }
          },
          required: ['sessionId', 'key', 'value']
        }
      },
      {
        name: 'context_reference_add',
        description: 'Add a reference to a context session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            type: { type: 'string', enum: ['block', 'document', 'selection'], description: 'Reference type' },
            id: { type: 'string', description: 'Reference ID' },
            content: { type: 'string', description: 'Content (required for selection type)' },
            metadata: { type: 'object', description: 'Metadata (optional)' }
          },
          required: ['sessionId', 'type', 'id']
        }
      },
      {
        name: 'context_reference_list',
        description: 'List references in a context session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            type: { type: 'string', enum: ['block', 'document', 'selection'], description: 'Reference type filter (optional)' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'context_merge',
        description: 'Merge context session data',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            strategy: { type: 'string', enum: ['recent', 'relevant', 'all'], description: 'Merge strategy', default: 'recent' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'context_summary',
        description: 'Export a context session summary',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'resources_discover',
        description: 'Discover available SiYuan resources (documents, blocks, notebooks)',
        inputSchema: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['document', 'block', 'notebook'], description: 'Resource type filter' },
            notebook: { type: 'string', description: 'Notebook ID filter (optional)' },
            query: { type: 'string', description: 'Search query' },
            offset: { type: 'number', description: 'Pagination offset', default: 0 },
            limit: { type: 'number', description: 'Maximum results to return', default: 50 },
            sortBy: { type: 'string', enum: ['created', 'updated', 'name'], description: 'Sort field', default: 'updated' },
            sortOrder: { type: 'string', enum: ['asc', 'desc'], description: 'Sort order', default: 'desc' }
          },
          required: []
        }
      },
      {
        name: 'resources_search',
        description: 'Search SiYuan resources by query string',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            type: { type: 'string', enum: ['document', 'block', 'notebook'], description: 'Resource type filter' },
            notebook: { type: 'string', description: 'Notebook ID filter (optional)' },
            offset: { type: 'number', description: 'Pagination offset', default: 0 },
            limit: { type: 'number', description: 'Maximum results to return', default: 20 }
          },
          required: ['query']
        }
      },
      {
        name: 'resources_stats',
        description: 'Get resource statistics',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'prompts_list',
        description: 'List all available prompt templates',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'prompts_get',
        description: 'Get a prompt template by name with variable substitution',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Prompt template name' },
            variables: { type: 'object', description: 'Template variables' }
          },
          required: ['name']
        }
      },
      {
        name: 'prompts_validate',
        description: 'Validate variables for a prompt template',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Prompt template name' },
            variables: { type: 'object', description: 'Variables to validate' }
          },
          required: ['name', 'variables']
        }
      },
      // ==================== Legacy / Standard tools (from Tools.ts handlers) ====================
      {
        name: 'list_notebooks',
        description: 'List all SiYuan notebooks',
        inputSchema: { type: 'object', properties: {}, required: [] }
      },
      {
        name: 'search_content',
        description: 'Full-text keyword search across SiYuan notes',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search keyword' },
            limit: { type: 'number', description: 'Maximum number of results', default: 10 }
          },
          required: ['query']
        }
      },
      {
        name: 'create_notebook',
        description: 'Create a new SiYuan notebook',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Notebook name' },
            icon: { type: 'string', description: 'Notebook icon', default: '📔' }
          },
          required: ['name']
        }
      },
      {
        name: 'create_subdocument',
        description: 'Create a child document under a parent document',
        inputSchema: {
          type: 'object',
          properties: {
            notebook: { type: 'string', description: 'Notebook ID' },
            parentPath: { type: 'string', description: 'Parent document path' },
            title: { type: 'string', description: 'Child document title' },
            content: { type: 'string', description: 'Child document content (Markdown)', default: '' }
          },
          required: ['notebook', 'parentPath', 'title']
        }
      },
      {
        name: 'batch_create_blocks',
        description: 'Batch create multiple content blocks',
        inputSchema: {
          type: 'object',
          properties: {
            requests: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  content: { type: 'string', description: 'Block content (Markdown)' },
                  parentID: { type: 'string', description: 'Parent block ID (optional)' },
                  previousID: { type: 'string', description: 'Previous sibling block ID (optional)' }
                },
                required: ['content']
              },
              description: 'List of batch create requests'
            }
          },
          required: ['requests']
        }
      },
      {
        name: 'batch_update_blocks',
        description: 'Batch update multiple content blocks',
        inputSchema: {
          type: 'object',
          properties: {
            requests: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'Block ID' },
                  content: { type: 'string', description: 'New content (Markdown)' }
                },
                required: ['id', 'content']
              },
              description: 'List of batch update requests'
            }
          },
          required: ['requests']
        }
      },
      {
        name: 'batch_delete_blocks',
        description: 'Batch delete multiple content blocks (paragraphs, headings, etc.). Do NOT use for documents — use doc_delete instead.',
        inputSchema: {
          type: 'object',
          properties: {
            blockIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of block IDs to delete'
            }
          },
          required: ['blockIds']
        }
      },
      {
        name: 'get_all_tags',
        description: 'Get all tags with usage statistics',
        inputSchema: {
          type: 'object',
          properties: {
            sortBy: { type: 'string', enum: ['name', 'count', 'created'], description: 'Sort field', default: 'count' },
            sortOrder: { type: 'string', enum: ['asc', 'desc'], description: 'Sort order', default: 'desc' }
          },
          required: []
        }
      },
      {
        name: 'search_tags',
        description: 'Search tags by keyword',
        inputSchema: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: 'Search keyword' },
            limit: { type: 'number', description: 'Maximum number of results', default: 20 }
          },
          required: ['keyword']
        }
      },
      {
        name: 'manage_block_tags',
        description: 'Add, remove, or replace tags on a block',
        inputSchema: {
          type: 'object',
          properties: {
            blockId: { type: 'string', description: 'Block ID' },
            operation: { type: 'string', enum: ['add', 'remove', 'replace'], description: 'Operation: "add", "remove", or "replace"' },
            tags: { type: 'array', items: { type: 'string' }, description: 'List of tags' }
          },
          required: ['blockId', 'operation', 'tags']
        }
      },
      {
        name: 'get_block_tags',
        description: 'Get all tags attached to a specific block',
        inputSchema: {
          type: 'object',
          properties: { blockId: { type: 'string', description: 'Block ID' } },
          required: ['blockId']
        }
      },
      {
        name: 'get_block_references',
        description: 'Get the full reference graph for a block',
        inputSchema: {
          type: 'object',
          properties: {
            blockId: { type: 'string', description: 'Block ID' },
            includeBacklinks: { type: 'boolean', description: 'Include backlinks', default: true },
            maxDepth: { type: 'number', description: 'Maximum depth', default: 3 }
          },
          required: ['blockId']
        }
      },
      {
        name: 'get_backlinks',
        description: 'Get backlinks (incoming references) for a block',
        inputSchema: {
          type: 'object',
          properties: {
            blockId: { type: 'string', description: 'Block ID' },
            includeContent: { type: 'boolean', description: 'Include content', default: true }
          },
          required: ['blockId']
        }
      },
      {
        name: 'create_reference',
        description: 'Create a reference link between two blocks',
        inputSchema: {
          type: 'object',
          properties: {
            sourceBlockId: { type: 'string', description: 'Source block ID' },
            targetBlockId: { type: 'string', description: 'Target block ID' },
            referenceType: { type: 'string', enum: ['link', 'embed', 'mention'], description: 'Reference type', default: 'link' }
          },
          required: ['sourceBlockId', 'targetBlockId']
        }
      },
      {
        name: 'advanced_search',
        description: 'Advanced multi-criteria search (tags, date range, block type)',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            notebook: { type: 'string', description: 'Notebook ID (optional)' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Tag filter (optional)' },
            dateRange: {
              type: 'object',
              properties: {
                start: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
                end: { type: 'string', description: 'End date (YYYY-MM-DD)' }
              },
              description: 'Date range filter (optional)'
            },
            blockType: { type: 'string', enum: ['paragraph', 'heading', 'list', 'code', 'table'], description: 'Block type filter (optional)' },
            limit: { type: 'number', description: 'Maximum number of results', default: 50 }
          },
          required: ['query']
        }
      },
      {
        name: 'quick_text_search',
        description: 'Quick text search with case-sensitivity and whole-word options',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Text to search for' },
            caseSensitive: { type: 'boolean', description: 'Case-sensitive search', default: false },
            wholeWord: { type: 'boolean', description: 'Whole-word match', default: false },
            limit: { type: 'number', description: 'Maximum number of results', default: 20 }
          },
          required: ['text']
        }
      },
      {
        name: 'search_by_tags',
        description: 'Search content by one or multiple tags',
        inputSchema: {
          type: 'object',
          properties: {
            tags: { type: 'array', items: { type: 'string' }, description: 'List of tags' },
            matchMode: { type: 'string', enum: ['any', 'all'], description: 'Match mode: "any" or "all"', default: 'any' },
            limit: { type: 'number', description: 'Maximum number of results', default: 30 }
          },
          required: ['tags']
        }
      },
      {
        name: 'search_by_date_range',
        description: 'Search content by creation or modification date range',
        inputSchema: {
          type: 'object',
          properties: {
            startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
            endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
            dateType: { type: 'string', enum: ['created', 'updated'], description: 'Date type: "created" or "updated"', default: 'updated' },
            limit: { type: 'number', description: 'Maximum number of results', default: 50 }
          },
          required: ['startDate', 'endDate']
        }
      },
      {
        name: 'recursive_search_notes',
        description: 'Deep recursive search with optional fuzzy matching',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            notebook: { type: 'string', description: 'Notebook ID (optional)' },
            options: {
              type: 'object',
              properties: {
                maxDepth: { type: 'number', description: 'Maximum search depth', default: 3 },
                includeContent: { type: 'boolean', description: 'Include content', default: true },
                fuzzyMatch: { type: 'boolean', description: 'Enable fuzzy matching', default: false },
                limit: { type: 'number', description: 'Maximum number of results', default: 50 }
              },
              description: 'Search options (optional)'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'batch_read_all_documents',
        description: 'Batch-read all documents in a notebook',
        inputSchema: {
          type: 'object',
          properties: {
            notebookId: { type: 'string', description: 'Notebook ID' },
            options: {
              type: 'object',
              properties: {
                maxDepth: { type: 'number', description: 'Maximum read depth', default: 2 },
                includeContent: { type: 'boolean', description: 'Include document content', default: false },
                batchSize: { type: 'number', description: 'Batch size', default: 10 },
                delay: { type: 'number', description: 'Delay between batches (ms)', default: 100 }
              },
              description: 'Read options (optional)'
            }
          },
          required: ['notebookId']
        }
      },
      // ==================== Document CRUD ====================
      {
        name: 'doc_get',
        description: 'Read a SiYuan document Markdown content and path by ID.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Document block ID (root ID). Get via list_notebooks, search_content, etc.' }
          },
          required: ['id']
        }
      },
      {
        name: 'doc_rename',
        description: 'Rename a SiYuan document by ID.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Document block ID to rename' },
            title: { type: 'string', description: 'New document title' }
          },
          required: ['id', 'title']
        }
      },
      {
        name: 'doc_delete',
        description: 'Delete a document (sends to SiYuan trash, recoverable). Refuses if children exist unless cascade:true.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Document block ID to delete' },
            cascade: { type: 'boolean', description: 'false (default): refuse if children exist. true: delete all children depth-first then parent.' }
          },
          required: ['id']
        }
      },
      {
        name: 'doc_move',
        description: 'Move one or more SiYuan documents to a new parent (document or notebook).',
        inputSchema: {
          type: 'object',
          properties: {
            fromIds: { type: 'array', items: { type: 'string' }, description: 'IDs of documents to move (at least 1)', minItems: 1 },
            toId: { type: 'string', description: 'Target parent document ID or target notebook ID' }
          },
          required: ['fromIds', 'toId']
        }
      },
      // ==================== Attribute View (Database) Tools ====================
      {
        name: 'av_list_databases',
        description: 'List all Attribute View databases in the workspace (name, column count, row count).',
        inputSchema: {
          type: 'object',
          properties: {
            nameFilter: { type: 'string', description: 'Optional name prefix filter, case-insensitive (e.g. "DB-")' }
          },
          required: []
        }
      },
      {
        name: 'av_render_database',
        description: 'Read a full Attribute View database: all columns (with types) and all rows (with parsed values).',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Database ID (Attribute View block ID), e.g. 20251215105701-op0w1p9' }
          },
          required: ['id']
        }
      },
      {
        name: 'av_delete_row',
        description: 'Delete one or more rows from an Attribute View database. Irreversible.',
        inputSchema: {
          type: 'object',
          properties: {
            avId: { type: 'string', description: 'Database ID (Attribute View block ID)' },
            rowIds: { type: 'array', items: { type: 'string' }, description: 'Row IDs to delete (at least 1). Get IDs from av_render_database.' }
          },
          required: ['avId', 'rowIds']
        }
      },
      {
        name: 'av_update_row',
        description: 'Update one or more cells in a row in an Attribute View database (batch). Use av_render_database first to get keyIds.',
        inputSchema: {
          type: 'object',
          properties: {
            avId: { type: 'string', description: 'Database ID (Attribute View block ID)' },
            rowId: { type: 'string', description: 'Row ID to update (from av_render_database or av_query_database)' },
            updates: {
              type: 'array',
              description: 'List of cells to update (one or more)',
              items: {
                type: 'object',
                properties: {
                  keyId: { type: 'string', description: 'Column ID (keyID, from av_render_database)' },
                  type: { type: 'string', enum: ['text', 'number', 'checkbox', 'select', 'mSelect', 'date', 'url', 'email', 'phone'], description: 'Column type' },
                  content: { description: 'New value: string for text/select/url/email/phone, number for number/date (timestamp ms), boolean for checkbox, string[] for mSelect' }
                },
                required: ['keyId', 'type', 'content']
              },
              minItems: 1
            }
          },
          required: ['avId', 'rowId', 'updates']
        }
      },
      {
        name: 'av_create_row',
        description: 'Create a new detached row in an Attribute View database. Returns the created row with its ID and cell values.',
        inputSchema: {
          type: 'object',
          properties: {
            avId: { type: 'string', description: 'Database ID (Attribute View block ID)' },
            name: { type: 'string', description: 'Name/title of the new row (primary "block" column content). Empty if omitted.' },
            values: {
              type: 'array',
              description: 'Optional initial values for other columns',
              items: {
                type: 'object',
                properties: {
                  keyId: { type: 'string', description: 'Column ID (keyID, from av_render_database)' },
                  type: { type: 'string', enum: ['text', 'number', 'checkbox', 'select', 'mSelect', 'date', 'url', 'email', 'phone'], description: 'Column type' },
                  content: { description: 'Value by type: string for text/select/url/email/phone, number for number/date (ms timestamp), boolean for checkbox, string[] for mSelect' }
                },
                required: ['keyId', 'type', 'content']
              }
            }
          },
          required: ['avId']
        }
      },
      {
        name: 'av_query_database',
        description: 'Filter rows in an Attribute View database by column name and value (partial match, case-insensitive).',
        inputSchema: {
          type: 'object',
          properties: {
            avId: { type: 'string', description: 'Database ID (Attribute View block ID)' },
            column: { type: 'string', description: 'Column name or ID to filter by (e.g. "Status", "Area")' },
            value: { type: 'string', description: 'Value to search for (partial match, case-insensitive)' }
          },
          required: ['avId', 'column', 'value']
        }
      },
      {
        name: 'av_create_database',
        description: 'Create a new Attribute View database with a document in a notebook. Returns avId for use with all other av_* tools.',
        inputSchema: {
          type: 'object',
          properties: {
            notebookId: { type: 'string', description: 'Notebook ID where the database will be created (from list_notebooks)' },
            name: { type: 'string', description: 'Database name (also used as the document title)' },
            columns: {
              type: 'array',
              description: 'Optional additional columns (primary "Name" column is always created automatically)',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Column name' },
                  type: { type: 'string', enum: ['text','number','select','mSelect','date','checkbox','url','email','phone','mAsset','created','updated','lineNumber','template','rollup','relation'], description: 'Column type' }
                },
                required: ['name', 'type']
              }
            }
          },
          required: ['notebookId', 'name']
        }
      },
      // 新增批量操作工具
      {
        name: 'batch_create_docs',
        description: 'Batch create multiple documents',
        inputSchema: {
          type: 'object',
          properties: {
            requests: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  notebook: { type: 'string', description: 'Notebook ID' },
                  path: { type: 'string', description: 'Document path' },
                  title: { type: 'string', description: 'Document title' },
                  content: { type: 'string', description: 'Document content (optional)' }
                },
                required: ['notebook', 'path', 'title']
              },
              description: 'List of batch document create requests'
            }
          },
          required: ['requests']
        }
      },
      {
        name: 'batch_search_queries',
        description: 'Batch search (runs queries in parallel)',
        inputSchema: {
          type: 'object',
          properties: {
            queries: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of search queries'
            },
            limit: { type: 'number', description: 'Result limit per query', default: 10 }
          },
          required: ['queries']
        }
      },
      {
        name: 'system_cache_stats',
        description: 'Get cache statistics',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'system_retry_stats',
        description: 'Get retry/resilience statistics',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'system_health':
        const healthResult = await siyuanClient.checkHealth();
        return {
          content: [{ type: 'text', text: JSON.stringify(healthResult, null, 2) }]
        };

      case 'system_discover_ports':
        const portDiscovery = createPortDiscovery(process.env.SIYUAN_API_TOKEN || process.env.SIYUAN_TOKEN || '');
        const result = await portDiscovery.autoDiscover();
        return {
          content: [{ 
            type: 'text', 
            text: JSON.stringify({
              discoveredPort: result,
              success: result !== null
            }, null, 2) 
          }]
        };

      case 'blocks_get':
        const blockResult = await siyuanClient.blocks.getBlock(args?.id as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(blockResult, null, 2) }]
        };

      case 'blocks_create':
        const createResult = await siyuanClient.blocks.insertBlock(
          args?.content as string, 
          args?.parentID as string, 
          args?.previousID as string
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(createResult, null, 2) }]
        };

      case 'blocks_update':
        const updateResult = await siyuanClient.blocks.updateBlock(args?.id as string, args?.content as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(updateResult, null, 2) }]
        };

      case 'blocks_delete':
        const deleteResult = await siyuanClient.blocks.deleteBlock(args?.id as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(deleteResult, null, 2) }]
        };

      case 'blocks_move':
        const moveResult = await siyuanClient.blocks.moveBlock(
          args?.id as string, 
          args?.parentID as string, 
          args?.previousID as string
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(moveResult, null, 2) }]
        };

      case 'docs_create':
        try {
          // 增强的文档创建，包含参数验证和错误处理
          const docCreateResult = await siyuanClient.documents.createDoc(
            args?.notebook as string || '', 
            args?.path as string, 
            args?.title as string, 
            args?.content as string || ''
          );
          
          // 标准化响应格式，便于AI理解
          const response = {
            success: true,
            operation: 'create_document',
            data: docCreateResult,
            message: 'Document created successfully',
            timestamp: new Date().toISOString()
          };
          
          return {
            content: [{ type: 'text', text: JSON.stringify(response, null, 2) }]
          };
        } catch (error: any) {
          const errorResponse = {
            success: false,
            operation: 'create_document',
            error: error.message,
            suggestions: [
              'Check path format (must start with /)',
              'Ensure title is not empty',
              'Verify SiYuan service is running',
              '检查Notebook ID是否有效'
            ],
            timestamp: new Date().toISOString()
          };
          
          return {
            content: [{ type: 'text', text: JSON.stringify(errorResponse, null, 2) }]
          };
        }

      case 'docs_list':
        const docListResult = await siyuanClient.documents.listDocs(
          args?.notebook as string
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(docListResult, null, 2) }]
        };

      case 'assets_upload':
        // 处理文件上传 - 如果是字符串，假设是base64或需要转换
        const fileData = args?.file as string;
        const buffer = Buffer.from(fileData, 'base64'); // 假设是base64编码
        const uploadResult = await siyuanClient.assets.uploadAsset(
          buffer,
          'uploaded-file', // 默认文件名
          args?.assetsDirPath as string
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(uploadResult, null, 2) }]
        };

      case 'assets_list':
        const assetsResult = args?.type === 'images' 
          ? await siyuanClient.assets.getDocImageAssets(args?.id as string)
          : await siyuanClient.assets.getDocAssets(args?.id as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(assetsResult, null, 2) }]
        };

      case 'assets_unused':
        const unusedResult = await siyuanClient.assets.getUnusedAssets();
        return {
          content: [{ type: 'text', text: JSON.stringify(unusedResult, null, 2) }]
        };

      case 'assets_missing':
        const missingResult = await siyuanClient.assets.getMissingAssets();
        return {
          content: [{ type: 'text', text: JSON.stringify(missingResult, null, 2) }]
        };

      case 'assets_rename':
        const renameResult = await siyuanClient.assets.renameAsset(
          args?.oldPath as string, 
          args?.newPath as string
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(renameResult, null, 2) }]
        };

      case 'assets_ocr':
        const ocrResult = await siyuanClient.assets.ocr(args?.path as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(ocrResult, null, 2) }]
        };

      // 上下文管理工具
      case 'context_session_create':
        const session = await contextManager.createSession(args?.userId as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(session, null, 2) }]
        };

      case 'context_session_get':
        const sessionData = await contextManager.getSessionContext(
          args?.sessionId as string, 
          args?.key as string
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(sessionData, null, 2) }]
        };

      case 'context_session_update':
        await contextManager.updateSessionContext(
          args?.sessionId as string,
          args?.key as string,
          args?.value
        );
        return {
          content: [{ type: 'text', text: 'Session context updated successfully' }]
        };

      case 'context_reference_add':
        const refType = args?.type as 'block' | 'document' | 'selection';
        const sessionId = args?.sessionId as string;
        const refId = args?.id as string;
        
        if (refType === 'block') {
          await contextManager.addBlockReference(sessionId, refId);
        } else if (refType === 'document') {
          await contextManager.addDocumentReference(sessionId, refId);
        } else if (refType === 'selection') {
          await contextManager.addSelectionReference(
            sessionId, 
            refId, 
            args?.content as string, 
            args?.metadata as Record<string, any>
          );
        }
        
        return {
          content: [{ type: 'text', text: `Reference added to session ${sessionId}` }]
        };

      case 'context_reference_list':
        const references = await contextManager.getReferences(
          args?.sessionId as string,
          args?.type as 'block' | 'document' | 'selection'
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(references, null, 2) }]
        };

      case 'context_merge':
        const mergedContext = await contextManager.mergeContexts(
          args?.sessionId as string,
          args?.strategy as 'recent' | 'relevant' | 'all'
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(mergedContext, null, 2) }]
        };

      case 'context_summary':
        const summary = await contextManager.exportContextSummary(args?.sessionId as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }]
        };

      // 资源Discovered工具
      case 'resources_discover':
        try {
          const discoverResult = await resourceDirectory.discoverResources(
            {
              type: args?.type as 'document' | 'block' | 'notebook',
              notebook: args?.notebook as string,
              query: args?.query as string
            },
            {
              offset: args?.offset as number || 0,
              limit: args?.limit as number || 20,
              sortBy: args?.sortBy as 'created' | 'updated' | 'name' || 'updated',
              sortOrder: args?.sortOrder as 'asc' | 'desc' || 'desc'
            }
          );
          
          return {
            content: [{ 
              type: 'text', 
              text: JSON.stringify({
                success: true,
                data: discoverResult.resources,
                total: discoverResult.total,
                hasMore: discoverResult.hasMore,
                message: `Discovered ${discoverResult.resources.length}  resources`
              }, null, 2) 
            }]
          };
        } catch (error: any) {
          return {
            content: [{ 
              type: 'text', 
              text: JSON.stringify({
                success: false,
                data: [],
                message: 'Error during resource discovery',
                error: error.message
              }, null, 2) 
            }]
          };
        }

      case 'resources_search':
        try {
          const query = args?.query as string;
          
          if (!query || query.trim() === '') {
            return {
              content: [{ 
                type: 'text', 
                text: JSON.stringify({
                  success: false,
                  data: [],
                  message: 'Search query不能为空',
                  error: 'Empty query parameter'
                }, null, 2) 
              }]
            };
          }

          const resourceSearchResult = await resourceDirectory.searchResources(
            query.trim(),
            {
              type: args?.type as 'document' | 'block' | 'notebook',
              notebook: args?.notebook as string
            },
            {
              offset: args?.offset as number,
              limit: args?.limit as number || 10
            }
          );
          
          return {
            content: [{ 
              type: 'text', 
              text: JSON.stringify({
                success: true,
                data: resourceSearchResult.resources,
                total: resourceSearchResult.total,
                hasMore: resourceSearchResult.hasMore,
                message: `Found ${resourceSearchResult.resources.length}  resources`
              }, null, 2) 
            }]
          };
        } catch (error: any) {
          return {
            content: [{ 
              type: 'text', 
              text: JSON.stringify({
                success: false,
                data: [],
                message: 'Error during resource search',
                error: error.message
              }, null, 2) 
            }]
          };
        }

      case 'resources_stats':
        const stats = await resourceDirectory.getResourceStats();
        return {
          content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }]
        };

      // 提示模板工具
      case 'prompts_list':
        const availablePrompts = promptTemplateManager.getAvailablePrompts();
        return {
          content: [{ type: 'text', text: JSON.stringify(availablePrompts, null, 2) }]
        };

      case 'prompts_get':
        const promptResult = await promptTemplateManager.getPrompt(
          args?.name as string,
          args?.variables as Record<string, any> || {}
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(promptResult, null, 2) }]
        };

      case 'prompts_validate':
        const validation = promptTemplateManager.validateVariables(
          args?.name as string,
          args?.variables as Record<string, any> || {}
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(validation, null, 2) }]
        };

      // 批量操作工具
      case 'batch_create_docs':
        const batchDocsResult = await siyuanClient.batch.batchCreateDocs(
          (args?.requests as any[]) || []
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(batchDocsResult, null, 2) }]
        };

      case 'batch_search_queries':
        const batchSearchResult = await siyuanClient.batch.batchSearchQueries(
          (args?.queries as string[]) || [], 
          args?.limit as number
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(batchSearchResult, null, 2) }]
        };

      case 'system_cache_stats':
        const { cacheManager } = await import('./utils/cache');
        const cacheStats = cacheManager.getAllStats();
        return {
          content: [{ type: 'text', text: JSON.stringify(cacheStats, null, 2) }]
        };

      case 'system_retry_stats':
        const { retryManager } = await import('./utils/retry');
        const retryStats = retryManager.getStats();
        return {
          content: [{ type: 'text', text: JSON.stringify(retryStats, null, 2) }]
        };

      // 合并工具处理 - 包含所有标准工具和增强API工具
      case 'list_notebooks':
      case 'search_content':
      case 'create_notebook':
      case 'create_subdocument':
      case 'batch_create_blocks':
      case 'batch_update_blocks':
      case 'batch_delete_blocks':
      case 'get_all_tags':
      case 'search_tags':
      case 'manage_block_tags':
      case 'get_block_tags':
      case 'get_block_references':
      case 'get_backlinks':
      case 'create_reference':
      case 'advanced_search':
      case 'quick_text_search':
      case 'search_by_tags':
      case 'search_by_date_range':
      case 'recursive_search_notes':
      case 'batch_read_all_documents':
      case 'doc_get':
      case 'doc_rename':
      case 'doc_delete':
      case 'doc_move':
      case 'av_list_databases':
      case 'av_render_database':
      case 'av_create_row':
      case 'av_delete_row':
      case 'av_update_row':
      case 'av_query_database':
      case 'av_create_database':
        const Result = await handleMergedTool(name, args);
        return Result; // 直接返回MCP格式的结果

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    logger.error({ error, tool: name }, 'Tool execution failed');
    throw error;
  }
});

// 注册资源处理器
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  try {
    const result = await resourceDirectory.discoverResources({}, { limit: 100 });
    
    return {
      resources: result.resources.map(resource => ({
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType
      }))
    };
  } catch (error) {
    logger.error({ error }, 'Failed to list resources');
    return { resources: [] };
  }
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  
  try {
    const content = await resourceDirectory.getResourceContent(uri);
    const metadata = await resourceDirectory.getResourceMetadata(uri);
    
    return {
      contents: [{
        uri,
        mimeType: metadata.mimeType || 'text/plain',
        text: content
      }]
    };
  } catch (error) {
    logger.error({ error, uri }, 'Failed to read resource');
    throw error;
  }
});

// 注册提示处理器
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  try {
    const prompts = promptTemplateManager.getAvailablePrompts();
    
    return {
      prompts: prompts.map(prompt => ({
        name: prompt.name,
        description: prompt.description,
        arguments: prompt.arguments?.map(arg => ({
          name: arg.name,
          description: arg.description,
          required: arg.required || false
        })) || []
      }))
    };
  } catch (error) {
    logger.error({ error }, 'Failed to list prompts');
    return { prompts: [] };
  }
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    const result = await promptTemplateManager.getPrompt(name, args || {});
    
    return {
      messages: result.messages
    };
  } catch (error) {
    logger.error({ error, name, args }, 'Failed to get prompt');
    throw error;
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('Siyuan MCP Server running on stdio');
}

main().catch((error) => {
  logger.error({ error }, 'Server failed to start');
  process.exit(1);
});
