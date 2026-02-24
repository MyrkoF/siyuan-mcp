/**
 * 合并工具集 - 整合所有MCP工具功能
 * 包含标准工具和增强API工具
 * 
 * @author CodeBuddy
 * @since 1.0.0
 */

import { Tool } from '@modelcontextprotocol/sdk/types';
import { createSiyuanClient } from '../siyuanClient/index';
import type { SiyuanClient } from '../siyuanClient/index';
import { BatchService } from '../services/batch-service';
import { TagService } from '../services/tag-service';
import { AttributeViewService, AVColumnSpec } from '../services/av-service';

import { ReferenceService } from '../services/reference-service';
import { AdvancedSearchService } from '../services/advanced-search-service';
import { DocService } from '../services/doc-service';

import { contextManager } from '../contextStore/manager';
import { resourceDirectory } from '../resources';
import { promptTemplateManager } from '../prompts';
import { createPortDiscovery } from '../utils/portDiscovery';

// 创建客户端实例 — env vars résolues dans createSiyuanClient()
const siyuanClient = createSiyuanClient({
  autoDiscoverPort: true
});

/**
 * 标准JSON响应接口定义
 */
interface StandardResponse {
  success: boolean;
  message: string;
  error?: string;
  data: any;
  timestamp?: string;
}

/**
 * 创建标准响应对象
 * @param success - 操作是否成功
 * @param message - 响应消息
 * @param data - 响应数据
 * @param error - 错误信息（可选）
 * @returns StandardResponse - 标准响应对象
 */
function createStandardResponse(success: boolean, message: string, data: any = null, error?: string): StandardResponse {
  const response: StandardResponse = {
    success,
    message,
    data,
    timestamp: new Date().toISOString()
  };
  
  if (error) {
    response.error = error;
  }
  
  return response;
}

/**
 * 合并工具类 - 整合所有工具功能
 */
export class MergedTools {
  private client: SiyuanClient;
  private batchService: BatchService;
  private tagService: TagService;
  private avService: AttributeViewService;
  private docService: DocService;

  private referenceService: ReferenceService;
  private searchService: AdvancedSearchService;

  constructor(client: SiyuanClient) {
    this.client = client;
    this.batchService = new BatchService(client);
    this.tagService = new TagService(client);
    this.avService = new AttributeViewService(client);
    this.docService = new DocService(client);

    this.referenceService = new ReferenceService(client);
    this.searchService = new AdvancedSearchService(client);
  }

  /**
   * 获取所有工具定义
   * @returns MCP工具定义数组
   */
  getTools(): Tool[] {
    return [
      // ==================== 标准工具 ====================
      {
        name: 'list_notebooks',
        description: 'List all notebooks',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'search_content',
        description: 'Full-text search across notes',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Keyword' },
            limit: { type: 'number', description: 'Max results', default: 10 }
          },
          required: ['query']
        }
      },
      {
        name: 'create_notebook',
        description: 'Create a new notebook',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Notebook name' },
            icon: { type: 'string', description: 'Icon emoji', default: '📔' }
          },
          required: ['name']
        }
      },
      {
        name: 'create_subdocument',
        description: 'Create a child document under a parent path',
        inputSchema: {
          type: 'object',
          properties: {
            notebook: { type: 'string', description: 'Notebook ID' },
            parentPath: { type: 'string', description: 'Parent path' },
            title: { type: 'string', description: 'Title' },
            content: { type: 'string', description: 'Content (Markdown)', default: '' }
          },
          required: ['notebook', 'parentPath', 'title']
        }
      },

      // ==================== 增强API工具 ====================
      {
        name: 'batch_create_blocks',
        description: 'Create multiple blocks in one call',
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
              description: 'Batch requests'
            }
          },
          required: ['requests']
        }
      },
      {
        name: 'batch_update_blocks',
        description: 'Update multiple blocks in one call',
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
              description: 'Batch update requests'
            }
          },
          required: ['requests']
        }
      },
      {
        name: 'batch_delete_blocks',
        description: 'Delete multiple content blocks. NOT for documents — use doc_delete.',
        inputSchema: {
          type: 'object',
          properties: {
            blockIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Block IDs to delete'
            }
          },
          required: ['blockIds']
        }
      },
      {
        name: 'get_all_tags',
        description: 'List all tags with usage counts',
        inputSchema: {
          type: 'object',
          properties: {
            sortBy: {
              type: 'string',
              enum: ['name', 'count', 'created'],
              description: 'Sort field',
              default: 'count'
            },
            sortOrder: {
              type: 'string',
              enum: ['asc', 'desc'],
              description: 'Sort order',
              default: 'desc'
            }
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
            keyword: { type: 'string', description: 'Keyword' },
            limit: { type: 'number', description: 'Max results', default: 20 }
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
            operation: {
              type: 'string',
              enum: ['add', 'remove', 'replace'],
              description: 'Operation type: "add", "remove", or "replace"'
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of tags'
            }
          },
          required: ['blockId', 'operation', 'tags']
        }
      },
      {
        name: 'get_block_tags',
        description: 'Get all tags on a block',
        inputSchema: {
          type: 'object',
          properties: {
            blockId: { type: 'string', description: 'Block ID' }
          },
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
            maxDepth: { type: 'number', description: 'Max depth', default: 3 }
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
            referenceType: {
              type: 'string',
              enum: ['link', 'embed', 'mention'],
              description: 'Reference type',
              default: 'link'
            }
          },
          required: ['sourceBlockId', 'targetBlockId']
        }
      },
      {
        name: 'advanced_search',
        description: 'Advanced search with filters (type, notebook, date range)',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            notebook: { type: 'string', description: 'Notebook ID (optional)' },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tag filter (optional)'
            },
            dateRange: {
              type: 'object',
              properties: {
                start: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
                end: { type: 'string', description: 'End date (YYYY-MM-DD)' }
              },
              description: 'Date range filter (optional)'
            },
            blockType: {
              type: 'string',
              enum: ['paragraph', 'heading', 'list', 'code', 'table'],
              description: 'Block type filter (optional)'
            },
            limit: { type: 'number', description: 'Max results', default: 50 }
          },
          required: ['query']
        }
      },
      {
        name: 'quick_text_search',
        description: 'Quick full-text search',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Text to search for' },
            caseSensitive: { type: 'boolean', description: 'Case-sensitive search', default: false },
            wholeWord: { type: 'boolean', description: 'Whole-word match', default: false },
            limit: { type: 'number', description: 'Max results', default: 20 }
          },
          required: ['text']
        }
      },
      {
        name: 'search_by_tags',
        description: 'Search notes by tag list',
        inputSchema: {
          type: 'object',
          properties: {
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of tags'
            },
            matchMode: {
              type: 'string',
              enum: ['any', 'all'],
              description: 'Match mode: "any" (any tag matches) or "all" (all tags must match)',
              default: 'any'
            },
            limit: { type: 'number', description: 'Max results', default: 30 }
          },
          required: ['tags']
        }
      },
      {
        name: 'search_by_date_range',
        description: 'Search notes by creation/update date range',
        inputSchema: {
          type: 'object',
          properties: {
            startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
            endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
            dateType: {
              type: 'string',
              enum: ['created', 'updated'],
              description: 'Date type: "created" or "updated"',
              default: 'updated'
            },
            limit: { type: 'number', description: 'Max results', default: 50 }
          },
          required: ['startDate', 'endDate']
        }
      },
      {
        name: 'recursive_search_notes',
        description: 'Recursively search notes in a notebook subtree',
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
                limit: { type: 'number', description: 'Max results', default: 50 }
              },
              description: 'Search options (optional)'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'batch_read_all_documents',
        description: 'Read all documents in a notebook',
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
        description: 'Get document content and metadata by ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Document block ID (root ID). Obtained via list_notebooks, search_content, etc.'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'doc_rename',
        description: 'Rename a document',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Document block ID to rename'
            },
            title: {
              type: 'string',
              description: 'New document title'
            }
          },
          required: ['id', 'title']
        }
      },
      {
        name: 'doc_delete',
        description: 'Delete a document by ID. Use this (not blocks_delete) for documents.',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Document block ID to delete'
            },
            cascade: {
              type: 'boolean',
              description: 'false (default): refuse if children exist and return their list. true: delete all children depth-first then parent. All goes to trash.'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'doc_move',
        description: 'Move document(s) to a new parent',
        inputSchema: {
          type: 'object',
          properties: {
            fromIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'IDs of documents to move (at least 1)',
              minItems: 1
            },
            toId: {
              type: 'string',
              description: 'Target parent document ID or target notebook ID (destination)'
            }
          },
          required: ['fromIds', 'toId']
        }
      },

      // ==================== Attribute View (Database) Tools ====================
      {
        name: 'av_list_databases',
        description: 'List all Attribute View databases',
        inputSchema: {
          type: 'object',
          properties: {
            nameFilter: {
              type: 'string',
              description: 'Optional name prefix filter, case-insensitive (e.g. "DB-" to see only databases named DB-*)'
            }
          },
          required: []
        }
      },
      {
        name: 'av_render_database',
        description: 'Read full database: columns and all rows',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Database ID (Attribute View block ID), e.g. 20251215105701-op0w1p9'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'av_delete_row',
        description: 'Delete rows from a database',
        inputSchema: {
          type: 'object',
          properties: {
            avId: {
              type: 'string',
              description: 'Database ID (Attribute View block ID)'
            },
            rowIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Row IDs to delete (at least 1). Get IDs from av_render_database.'
            }
          },
          required: ['avId', 'rowIds']
        }
      },
      {
        name: 'av_update_row',
        description: 'Update cell values in a database row',
        inputSchema: {
          type: 'object',
          properties: {
            avId: {
              type: 'string',
              description: 'Database ID (Attribute View block ID)'
            },
            rowId: {
              type: 'string',
              description: 'Row ID to update (from av_render_database or av_query_database)'
            },
            updates: {
              type: 'array',
              description: 'List of cells to update (one or more)',
              items: {
                type: 'object',
                properties: {
                  keyId: { type: 'string', description: 'Column ID (keyID, from av_render_database)' },
                  type: {
                    type: 'string',
                    enum: ['text', 'number', 'checkbox', 'select', 'mSelect', 'date', 'url', 'email', 'phone'],
                    description: 'Column type'
                  },
                  content: {
                    description: 'New value: string for text/select/url/email/phone, number for number/date (timestamp ms), boolean for checkbox, string[] for mSelect'
                  }
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
        description: 'Add a new row to a database',
        inputSchema: {
          type: 'object',
          properties: {
            avId: {
              type: 'string',
              description: 'Database ID (Attribute View block ID)'
            },
            name: {
              type: 'string',
              description: 'Name/title of the new row (primary "block" column content). Empty if omitted.'
            },
            values: {
              type: 'array',
              description: 'Optional initial values for other columns',
              items: {
                type: 'object',
                properties: {
                  keyId: { type: 'string', description: 'Column ID (keyID, from av_render_database)' },
                  type: {
                    type: 'string',
                    enum: ['text', 'number', 'checkbox', 'select', 'mSelect', 'date', 'url', 'email', 'phone'],
                    description: 'Column type'
                  },
                  content: {
                    description: 'Value by type: string for text/select/url/email/phone, number for number/date (ms timestamp), boolean for checkbox, string[] for mSelect'
                  }
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
        description: 'Filter database rows by column value',
        inputSchema: {
          type: 'object',
          properties: {
            avId: {
              type: 'string',
              description: 'Database ID (Attribute View block ID)'
            },
            column: {
              type: 'string',
              description: 'Column name or ID to filter by (e.g. "Status", "Area")'
            },
            value: {
              type: 'string',
              description: 'Value to search for (partial match, case-insensitive)'
            }
          },
          required: ['avId', 'column', 'value']
        }
      },
      {
        name: 'av_create_database',
        description: 'Create a new Attribute View database (SiYuan DB with typed columns)',
        inputSchema: {
          type: 'object',
          properties: {
            notebookId: {
              type: 'string',
              description: 'Notebook ID where the database will be created (from list_notebooks)'
            },
            name: {
              type: 'string',
              description: 'Database name (also used as the document title)'
            },
            columns: {
              type: 'array',
              description: 'Optional additional columns (primary "Name" column is always created automatically)',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Column name' },
                  type: {
                    type: 'string',
                    enum: ['text','number','select','mSelect','date','checkbox','url','email','phone','mAsset','created','updated','lineNumber','template','rollup','relation'],
                    description: 'Column type'
                  }
                },
                required: ['name', 'type']
              }
            }
          },
          required: ['notebookId', 'name']
        }
      },

      // ==================== System & Infrastructure ====================
      {
        name: 'siyuan_workspace_map',
        description: 'Generate a workspace map (all notebook + database IDs) ready to paste into Claude Desktop Project Instructions',
        inputSchema: { type: 'object', properties: {}, required: [] }
      },
      {
        name: 'system_health',
        description: 'Check SiYuan server connection',
        inputSchema: { type: 'object', properties: {}, required: [] }
      },
      {
        name: 'system_discover_ports',
        description: 'Auto-discover SiYuan port (scans 6806–6808)',
        inputSchema: { type: 'object', properties: {}, required: [] }
      },
      {
        name: 'system_cache_stats',
        description: 'Get cache statistics',
        inputSchema: { type: 'object', properties: {}, required: [] }
      },
      {
        name: 'system_retry_stats',
        description: 'Get retry/resilience statistics',
        inputSchema: { type: 'object', properties: {}, required: [] }
      },
      // ==================== Blocks ====================
      {
        name: 'blocks_get',
        description: 'Get block content (kramdown) by ID',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string', description: 'Block ID' } },
          required: ['id']
        }
      },
      {
        name: 'blocks_create',
        description: 'Insert a new block into a document',
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
        description: 'Update block content by ID',
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
        description: 'Delete a content block by ID. NOT for documents — use doc_delete.',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string', description: 'Block ID' } },
          required: ['id']
        }
      },
      {
        name: 'blocks_move',
        description: 'Move a block to a new parent or position',
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
      // ==================== Documents ====================
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
        description: 'List documents in a notebook',
        inputSchema: {
          type: 'object',
          properties: {
            notebook: { type: 'string', description: 'Notebook ID' },
            path: { type: 'string', description: 'Path (optional, defaults to root)' }
          },
          required: ['notebook']
        }
      },
      // ==================== Assets ====================
      {
        name: 'assets_upload',
        description: 'Upload a file asset to the workspace',
        inputSchema: {
          type: 'object',
          properties: {
            file: { type: 'string', description: 'File path or base64' },
            assetsDirPath: { type: 'string', description: 'Assets dir path' }
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
            type: { type: 'string', enum: ['all', 'images'], description: 'Asset type', default: 'all' }
          },
          required: ['id']
        }
      },
      {
        name: 'assets_unused',
        description: 'Find unused asset files in the workspace',
        inputSchema: { type: 'object', properties: {}, required: [] }
      },
      {
        name: 'assets_missing',
        description: 'Find referenced but missing asset files',
        inputSchema: { type: 'object', properties: {}, required: [] }
      },
      {
        name: 'assets_rename',
        description: 'Rename an asset file',
        inputSchema: {
          type: 'object',
          properties: {
            oldPath: { type: 'string', description: 'Old path' },
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
          properties: { path: { type: 'string', description: 'Image path' } },
          required: ['path']
        }
      },
      // ==================== Context ====================
      {
        name: 'context_session_create',
        description: 'Create a context session for multi-step tasks',
        inputSchema: {
          type: 'object',
          properties: { userId: { type: 'string', description: 'User ID (optional)' } },
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
            key: { type: 'string', description: 'Key (optional)' }
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
        description: 'Add a block/doc/selection reference to a session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            type: { type: 'string', enum: ['block', 'document', 'selection'], description: 'Reference type' },
            id: { type: 'string', description: 'Reference ID' },
            content: { type: 'string', description: 'Content (for selection)' },
            metadata: { type: 'object', description: 'Metadata' }
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
            type: { type: 'string', enum: ['block', 'document', 'selection'], description: 'Type filter' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'context_merge',
        description: 'Merge and summarize context session data',
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
          properties: { sessionId: { type: 'string', description: 'Session ID' } },
          required: ['sessionId']
        }
      },
      // ==================== Resources ====================
      {
        name: 'resources_discover',
        description: 'Browse available resources (docs, blocks, notebooks)',
        inputSchema: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['document', 'block', 'notebook'], description: 'Resource type filter' },
            notebook: { type: 'string', description: 'Notebook ID filter (optional)' },
            query: { type: 'string', description: 'Search query' },
            offset: { type: 'number', description: 'Offset', default: 0 },
            limit: { type: 'number', description: 'Max results', default: 50 },
            sortBy: { type: 'string', enum: ['created', 'updated', 'name'], description: 'Sort field', default: 'updated' },
            sortOrder: { type: 'string', enum: ['asc', 'desc'], description: 'Sort order', default: 'desc' }
          },
          required: []
        }
      },
      {
        name: 'resources_search',
        description: 'Search resources by query',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            type: { type: 'string', enum: ['document', 'block', 'notebook'], description: 'Resource type filter' },
            notebook: { type: 'string', description: 'Notebook ID filter (optional)' },
            offset: { type: 'number', description: 'Offset', default: 0 },
            limit: { type: 'number', description: 'Max results', default: 20 }
          },
          required: ['query']
        }
      },
      {
        name: 'resources_stats',
        description: 'Get resource count statistics',
        inputSchema: { type: 'object', properties: {}, required: [] }
      },
      // ==================== Prompts ====================
      {
        name: 'prompts_list',
        description: 'List available prompt templates',
        inputSchema: { type: 'object', properties: {}, required: [] }
      },
      {
        name: 'prompts_get',
        description: 'Get a prompt template with variable substitution',
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
      // ==================== Batch ====================
      {
        name: 'batch_create_docs',
        description: 'Create multiple documents in one call',
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
        description: 'Run multiple search queries in parallel',
        inputSchema: {
          type: 'object',
          properties: {
            queries: { type: 'array', items: { type: 'string' }, description: 'List of search queries' },
            limit: { type: 'number', description: 'Result limit per query', default: 10 }
          },
          required: ['queries']
        }
      },
    ];
  }

  /**
   * 处理工具调用
   * @param toolName 工具名称
   * @param args 参数
   * @returns 工具执行结果
   */
  async handleToolCall(toolName: string, args: any) {
    // 导入拦截器（动态导入避免循环依赖）
    const { toolCallInterceptor } = await import('../core/ToolCallInterceptor.js');
    
    // 拦截工具调用
    const interceptionResult = await toolCallInterceptor.interceptToolCall({
      toolName,
      parameters: args,
      requestId: `${toolName}_${Date.now()}`
    });

    // 如果被拦截，返回拦截结果
    if (!interceptionResult.allowed) {
      return createStandardResponse(
        false,
        interceptionResult.errors.join('; ') || '工具调用被拦截',
        null,
        interceptionResult.errors.join('; ')
      );
    }

    try {
      switch (toolName) {
        // ==================== 标准工具处理 ====================
        case 'list_notebooks':
          return await this.listNotebooks();


        case 'search_content':
          return await this.searchContent(args.query, args.limit);

        case 'create_notebook':
          return await this.createNotebook(args.name, args.icon);

        case 'create_subdocument':
          return await this.createSubDocument(args.notebook, args.parentPath, args.title, args.content);

        // ==================== 增强API工具处理 ====================
        case 'batch_create_blocks':
          return await this.batchService.batchCreateBlocks({
            blocks: args.requests,
            options: {}
          });

        case 'batch_update_blocks':
          return await this.batchService.batchUpdateBlocks({
            updates: args.requests,
            options: {}
          });

        case 'batch_delete_blocks':
          return await this.batchService.batchDeleteBlocks(args.blockIds);

        case 'get_all_tags':
          try {
            return await this.tagService.getAllTags(args);
          } catch (error) {
            // 如果原始服务失败，使用修复版本
            return await this.tagService.getAllTags(args);
          }

        case 'search_tags':
          try {
            return await this.tagService.searchTags(args.keyword, args);
          } catch (error) {
            // 如果原始服务失败，使用修复版本
            return await this.tagService.searchTags(args.keyword, args);
          }

        case 'manage_block_tags':
          return await this.tagService.manageBlockTags(args);

        case 'get_block_tags':
          return await this.tagService.getBlockTags(args.blockId);

        case 'get_block_references':
          return await this.referenceService.getBlockReferences(args);

        case 'get_backlinks':
          return await this.referenceService.getBacklinks(args.blockId, args.includeContent);

        case 'create_reference':
          return await this.referenceService.createReference(args.sourceBlockId, args.targetBlockId, args.referenceType);

        case 'advanced_search':
          return await this.searchService.advancedSearch(args);

        case 'quick_text_search':
          return await this.searchService.quickTextSearch(args.text, args);

        case 'search_by_tags':
          return await this.searchService.searchByTags(args.tags, args);

        case 'search_by_date_range':
          return await this.searchService.searchByDateRange(args, args);

        case 'recursive_search_notes':
          return await this.client.recursiveSearchNotes(args.query, args.notebook, args.options);

        case 'batch_read_all_documents':
          return await this.client.batchReadAllDocuments(args.notebookId, args.options);

        // ==================== Document CRUD ====================
        case 'doc_get':
          return await this.handleDocGet(args.id);

        case 'doc_rename':
          return await this.handleDocRename(args.id, args.title);

        case 'doc_delete':
          return await this.handleDocDelete(args.id, args.cascade ?? false);

        case 'doc_move':
          return await this.handleDocMove(args.fromIds, args.toId);

        // ==================== Attribute View (Database) ====================
        case 'av_list_databases':
          return await this.handleAvListDatabases(args.nameFilter);

        case 'av_render_database':
          return await this.handleAvRenderDatabase(args.id);

        case 'av_create_row':
          return await this.handleAvCreateRow(args.avId, args.name, args.values);

        case 'av_delete_row':
          return await this.handleAvDeleteRow(args.avId, args.rowIds);

        case 'av_update_row':
          return await this.handleAvUpdateRow(args.avId, args.rowId, args.updates);

        case 'av_query_database':
          return await this.handleAvQueryDatabase(args.avId, args.column, args.value);

        case 'av_create_database':
          return await this.handleAvCreateDatabase(args.notebookId, args.name, args.columns);

        // ==================== System & Infrastructure ====================
        case 'siyuan_workspace_map': {
          const nbResp = await this.client.request('/api/notebook/lsNotebooks');
          const notebooks = (nbResp?.data?.notebooks || nbResp?.notebooks || []) as any[];
          const databases = await this.avService.listDatabases() as any[];

          const lines: string[] = [
            '## SiYuan Workspace Map',
            '',
            '### Notebooks',
          ];
          for (const nb of notebooks) {
            lines.push(`- ${nb.name}: \`${nb.id}\``);
          }
          lines.push('', '### Attribute View Databases');
          for (const db of databases) {
            lines.push(`- ${db.name}: \`${db.id}\``);
          }
          lines.push(
            '',
            '---',
            'Paste this block into your Claude Desktop Project Instructions so Claude knows your IDs without having to discover them each session.',
          );
          return createStandardResponse(true, 'Workspace map generated', { map: lines.join('\n') });
        }

        case 'system_health':
          return createStandardResponse(true, 'Health check successful', await this.client.checkHealth());

        case 'system_discover_ports': {
          const pd = createPortDiscovery(process.env.SIYUAN_API_TOKEN || process.env.SIYUAN_TOKEN || '');
          const port = await pd.autoDiscover();
          return createStandardResponse(true, 'Port discovery complete', { discoveredPort: port, success: port !== null });
        }

        case 'system_cache_stats': {
          const { cacheManager } = await import('../utils/cache.js');
          return createStandardResponse(true, 'Cache stats retrieved', cacheManager.getAllStats());
        }

        case 'system_retry_stats': {
          const { retryManager } = await import('../utils/retry.js');
          return createStandardResponse(true, 'Retry stats retrieved', retryManager.getStats());
        }

        // ==================== Blocks ====================
        case 'blocks_get':
          return createStandardResponse(true, 'Block retrieved', await this.client.blocks.getBlock(args.id));

        case 'blocks_create':
          return createStandardResponse(true, 'Block created',
            await this.client.blocks.insertBlock(args.content, args.parentID, args.previousID));

        case 'blocks_update':
          return createStandardResponse(true, 'Block updated',
            await this.client.blocks.updateBlock(args.id, args.content));

        case 'blocks_delete':
          return createStandardResponse(true, 'Block deleted',
            await this.client.blocks.deleteBlock(args.id));

        case 'blocks_move':
          return createStandardResponse(true, 'Block moved',
            await this.client.blocks.moveBlock(args.id, args.parentID, args.previousID));

        // ==================== Documents ====================
        case 'docs_create':
          return createStandardResponse(true, 'Document created',
            await this.client.documents.createDoc(args.notebook || '', args.path, args.title, args.content || ''));

        case 'docs_list':
          return createStandardResponse(true, 'Documents listed',
            await this.client.documents.listDocs(args.notebook));

        // ==================== Assets ====================
        case 'assets_upload': {
          const buf = Buffer.from(args.file as string, 'base64');
          return createStandardResponse(true, 'Asset uploaded',
            await this.client.assets.uploadAsset(buf, 'uploaded-file', args.assetsDirPath));
        }

        case 'assets_list': {
          const res = args.type === 'images'
            ? await this.client.assets.getDocImageAssets(args.id)
            : await this.client.assets.getDocAssets(args.id);
          return createStandardResponse(true, 'Assets listed', res);
        }

        case 'assets_unused':
          return createStandardResponse(true, 'Unused assets found', await this.client.assets.getUnusedAssets());

        case 'assets_missing':
          return createStandardResponse(true, 'Missing assets found', await this.client.assets.getMissingAssets());

        case 'assets_rename':
          return createStandardResponse(true, 'Asset renamed',
            await this.client.assets.renameAsset(args.oldPath, args.newPath));

        case 'assets_ocr':
          return createStandardResponse(true, 'OCR complete', await this.client.assets.ocr(args.path));

        // ==================== Context ====================
        case 'context_session_create':
          return createStandardResponse(true, 'Session created',
            await contextManager.createSession(args.userId));

        case 'context_session_get':
          return createStandardResponse(true, 'Session data retrieved',
            await contextManager.getSessionContext(args.sessionId, args.key));

        case 'context_session_update':
          await contextManager.updateSessionContext(args.sessionId, args.key, args.value);
          return createStandardResponse(true, 'Session context updated', null);

        case 'context_reference_add': {
          const rType = args.type as 'block' | 'document' | 'selection';
          if (rType === 'block') await contextManager.addBlockReference(args.sessionId, args.id);
          else if (rType === 'document') await contextManager.addDocumentReference(args.sessionId, args.id);
          else if (rType === 'selection') await contextManager.addSelectionReference(args.sessionId, args.id, args.content, args.metadata);
          return createStandardResponse(true, `Reference added to session ${args.sessionId}`, null);
        }

        case 'context_reference_list':
          return createStandardResponse(true, 'References retrieved',
            await contextManager.getReferences(args.sessionId, args.type));

        case 'context_merge':
          return createStandardResponse(true, 'Context merged',
            await contextManager.mergeContexts(args.sessionId, args.strategy));

        case 'context_summary':
          return createStandardResponse(true, 'Summary exported',
            await contextManager.exportContextSummary(args.sessionId));

        // ==================== Resources ====================
        case 'resources_discover': {
          const dr = await resourceDirectory.discoverResources(
            { type: args.type, notebook: args.notebook, query: args.query },
            { offset: args.offset || 0, limit: args.limit || 20, sortBy: args.sortBy || 'updated', sortOrder: args.sortOrder || 'desc' }
          );
          return createStandardResponse(true, `Discovered ${dr.resources.length} resources`, dr);
        }

        case 'resources_search': {
          const sr = await resourceDirectory.searchResources(
            (args.query || '').trim(),
            { type: args.type, notebook: args.notebook },
            { offset: args.offset, limit: args.limit || 10 }
          );
          return createStandardResponse(true, `Found ${sr.resources.length} resources`, sr);
        }

        case 'resources_stats':
          return createStandardResponse(true, 'Resource stats retrieved',
            await resourceDirectory.getResourceStats());

        // ==================== Prompts ====================
        case 'prompts_list':
          return createStandardResponse(true, 'Prompts listed',
            promptTemplateManager.getAvailablePrompts());

        case 'prompts_get':
          return createStandardResponse(true, 'Prompt retrieved',
            await promptTemplateManager.getPrompt(args.name, args.variables || {}));

        case 'prompts_validate':
          return createStandardResponse(true, 'Validation complete',
            promptTemplateManager.validateVariables(args.name, args.variables || {}));

        // ==================== Batch ====================
        case 'batch_create_docs':
          return createStandardResponse(true, 'Documents created',
            await this.client.batch.batchCreateDocs(args.requests || []));

        case 'batch_search_queries':
          return createStandardResponse(true, 'Search complete',
            await this.client.batch.batchSearchQueries(args.queries || [], args.limit));


        default:
          throw new Error(`未知的工具: ${toolName}`);
      }
    } catch (error: any) {
      throw new Error(`工具执行失败: ${error.message}`);
    }
  }

  // ==================== 标准工具实现 ====================

  /**
   * 获取笔记本列表 - 返回标准JSON格式
   * @returns Promise<StandardResponse> - 返回包含笔记本列表的标准JSON响应
   * @throws Error - 当获取笔记本失败时抛出异常
   */
  private async listNotebooks(): Promise<StandardResponse> {
    try {
      const response = await this.client.request('/api/notebook/lsNotebooks');
      
      // 处理思源API的标准响应格式
      const notebooks = response?.data?.notebooks || response?.notebooks || [];
      
      if (!Array.isArray(notebooks)) {
        return createStandardResponse(
          false,
          "获取笔记本列表失败",
          null,
          "无法获取有效的笔记本数据"
        );
      }

      // 验证每个笔记本的真实性
      const validNotebooks = [];
      for (const notebook of notebooks) {
        if (notebook && notebook.id && notebook.name) {
          validNotebooks.push({
            id: notebook.id,
            name: notebook.name,
            icon: notebook.icon || '📔',
            closed: notebook.closed || false,
            sort: notebook.sort || 0
          });
        }
      }

      return createStandardResponse(
        true,
        `成功获取 ${validNotebooks.length} 个笔记本`,
        {
          notebooks: validNotebooks,
          total: validNotebooks.length
        }
      );
    } catch (error: any) {
      // 完全禁用日志输出 - 用户不需要任何日志
      return createStandardResponse(
        false,
        "获取笔记本列表时发生错误",
        null,
        error?.message || '未知错误'
      );
    }
  }

  /**

  /**
   * 搜索内容 - 返回标准JSON格式
   * @param query - Search keyword
   * @param limit - Maximum number of results to return
   * @returns Promise<StandardResponse> - 返回搜索结果的标准JSON响应
   * @throws Error - 当搜索失败时抛出异常
   */
  private async searchContent(query: string, limit: number = 10): Promise<StandardResponse> {
    try {
      // 参数验证
      if (!query || query.trim() === '') {
        return createStandardResponse(
          false,
          "搜索参数无效",
          { query, limit },
          "Search keyword不能为空"
        );
      }

      const results = await this.client.searchNotes(query.trim(), Math.max(1, Math.min(limit, 100)));
      
      // 处理思源API的标准响应格式
      const blocks = results?.data?.blocks || results?.blocks || [];
      
      if (!Array.isArray(blocks)) {
        return createStandardResponse(
          false,
          "搜索返回无效结果",
          { query, limit },
          "API返回的数据格式不正确"
        );
      }

      // 处理搜索结果，确保格式正确
      const processedResults = blocks.slice(0, limit).map((result: any) => ({
        id: result.id || '',
        title: result.title || '无标题',
        content: result.content || '',
        contentPreview: (result.content || '').substring(0, 150) + ((result.content || '').length > 150 ? '...' : ''),
        notebook: result.notebook || '',
        notebookName: result.notebookName || '',
        path: result.path || '',
        score: result.score || 0,
        type: result.type || 'block'
      }));

      return createStandardResponse(
        true,
        `Found ${processedResults.length} 条搜索结果`,
        {
          query: query.trim(),
          results: processedResults,
          total: processedResults.length,
          limit: limit,
          hasMore: blocks.length > limit
        }
      );
    } catch (error: any) {
      // 完全禁用日志输出 - 用户不需要任何日志
      return createStandardResponse(
        false,
        "搜索时发生错误",
        { query, limit },
        error?.message || '未知错误'
      );
    }
  }

  /**
   * 创建笔记本 - 返回标准JSON格式
   * @param name - Notebook name
   * @param icon - Notebook icon
   * @returns Promise<StandardResponse> - 返回创建结果的标准JSON响应
   * @throws Error - 当创建笔记本失败时抛出异常
   */
  private async createNotebook(name: string, icon: string = '📔'): Promise<StandardResponse> {
    try {
      // 参数验证
      if (!name || name.trim() === '') {
        return createStandardResponse(
          false,
          "Notebook name无效",
          { name, icon },
          "Notebook name不能为空"
        );
      }

      const result = await this.client.request('/api/notebook/createNotebook', {
        name: name.trim(),
        icon: icon || '📔'
      });
      
      if (result && result.code === 0 && result.data) {
        const notebookId = result.data.notebook?.id || result.data.id;
        return createStandardResponse(
          true,
          "笔记本创建成功",
          {
            id: notebookId,
            name: name.trim(),
            icon: icon || '📔',
            closed: false,
            sort: 0
          }
        );
      } else {
        return createStandardResponse(
          false,
          "笔记本创建失败",
          { name: name.trim(), icon },
          result?.msg || '创建失败'
        );
      }
    } catch (error: any) {
      // 完全禁用日志输出 - 用户不需要任何日志
      return createStandardResponse(
        false,
        "创建笔记本时发生错误",
        { name, icon },
        error?.message || '未知错误'
      );
    }
  }

  /**
   * 创建子文档 - 返回标准JSON格式
   * @param notebook - Notebook ID
   * @param parentPath - Parent document path
   * @param title - 子Document title
   * @param content - 子文档内容
   * @returns Promise<StandardResponse> - 返回创建结果的标准JSON响应
   * @throws Error - 当创建子文档失败时抛出异常
   */
  private async createSubDocument(notebook: string, parentPath: string, title: string, content: string = ''): Promise<StandardResponse> {
    try {
      // 参数验证
      if (!notebook || !parentPath || !title) {
        return createStandardResponse(
          false,
          "Parameter validation failed",
          { notebook, parentPath, title },
          "Notebook ID、父路径和标题都是必需的"
        );
      }

      // 构建子Document path
      const subDocPath = `${parentPath}/${title}`;
      
      // 使用正确的API创建子文档
      const result = await this.client.request('/api/filetree/createDocWithMd', {
        notebook: notebook,
        path: subDocPath,
        markdown: content
      });

      if (result && result.code === 0 && result.data) {
        const docId = result.data;
        return createStandardResponse(
          true,
          "子Document created successfully",
          {
            id: docId,
            title: title,
            notebook: notebook,
            parentPath: parentPath,
            fullPath: subDocPath,
            contentPreview: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
            contentLength: content.length
          }
        );
      } else {
        return createStandardResponse(
          false,
          "子文档创建失败",
          { title, notebook, parentPath },
          result?.msg || '创建失败'
        );
      }
    } catch (error: any) {
      // 完全禁用日志输出 - 用户不需要任何日志
      return createStandardResponse(
        false,
        "创建子文档时发生错误",
        { title, notebook, parentPath },
        error?.message || '未知错误'
      );
    }
  }

  // ==================== Document CRUD implementations ====================

  private async handleDocGet(id: string): Promise<StandardResponse> {
    try {
      if (!id?.trim()) {
        return createStandardResponse(false, 'Paramètre manquant', null, 'id est requis');
      }
      const doc = await this.docService.getDocument(id);
      return createStandardResponse(true, `Document "${doc.hPath}" lu (${doc.content.length} caractères)`, doc);
    } catch (error: any) {
      return createStandardResponse(false, 'Erreur lors de la lecture du document', null, error?.message);
    }
  }

  private async handleDocRename(id: string, title: string): Promise<StandardResponse> {
    try {
      if (!id?.trim() || !title?.trim()) {
        return createStandardResponse(false, 'Paramètres manquants', null, 'id et title sont requis');
      }
      await this.docService.renameDocument(id, title);
      return createStandardResponse(true, `Document renommé en "${title}"`, { id, title });
    } catch (error: any) {
      return createStandardResponse(false, 'Erreur lors du renommage', null, error?.message);
    }
  }

  private async handleDocDelete(id: string, cascade: boolean): Promise<StandardResponse> {
    try {
      if (!id?.trim()) {
        return createStandardResponse(false, 'Paramètre manquant', null, 'id est requis');
      }
      const result = await this.docService.deleteDocument(id, cascade);
      const msg = result.childCount > 0
        ? `Document supprimé avec ${result.childCount} enfant(s) (corbeille SiYuan)`
        : 'Document supprimé (corbeille SiYuan)';
      return createStandardResponse(true, msg, result);
    } catch (error: any) {
      return createStandardResponse(false, 'Suppression refusée ou échouée', null, error?.message);
    }
  }

  private async handleDocMove(fromIds: string[], toId: string): Promise<StandardResponse> {
    try {
      if (!fromIds?.length || !toId?.trim()) {
        return createStandardResponse(false, 'Paramètres manquants', null, 'fromIds et toId sont requis');
      }
      await this.docService.moveDocuments(fromIds, toId);
      return createStandardResponse(
        true,
        `${fromIds.length} document(s) déplacé(s) vers ${toId}`,
        { fromIds, toId, count: fromIds.length }
      );
    } catch (error: any) {
      return createStandardResponse(false, 'Erreur lors du déplacement', null, error?.message);
    }
  }

  // ==================== Attribute View implementations ====================

  private async handleAvListDatabases(nameFilter?: string): Promise<StandardResponse> {
    try {
      const databases = await this.avService.listDatabases(nameFilter);
      const filterMsg = nameFilter ? ` (filtre: "${nameFilter}")` : '';
      return createStandardResponse(
        true,
        `${databases.length} database(s) trouvée(s)${filterMsg}`,
        { databases, total: databases.length }
      );
    } catch (error: any) {
      return createStandardResponse(false, 'Erreur lors du listage des databases', null, error?.message);
    }
  }

  private async handleAvRenderDatabase(id: string): Promise<StandardResponse> {
    try {
      if (!id) {
        return createStandardResponse(false, 'ID de database requis', null, 'Paramètre id manquant');
      }
      const db = await this.avService.renderDatabase(id);
      return createStandardResponse(
        true,
        `Database "${db.name}" lue: ${db.rows.length} lignes, ${db.columns.length} colonnes`,
        db
      );
    } catch (error: any) {
      return createStandardResponse(false, 'Erreur lors de la lecture de la database', null, error?.message);
    }
  }

  private async handleAvCreateRow(avId: string, name?: string, values?: any[]): Promise<StandardResponse> {
    try {
      if (!avId) {
        return createStandardResponse(false, 'Paramètre manquant', null, 'avId est requis');
      }
      const newRow = await this.avService.createRow(avId, name ?? '', values ?? []);
      if (!newRow) {
        return createStandardResponse(
          false,
          'Ligne créée mais introuvable dans le diff post-render',
          null,
          'La ligne a peut-être été créée mais son ID ne peut pas être déterminé'
        );
      }
      return createStandardResponse(
        true,
        `Ligne créée avec succès (ID: ${newRow.id})`,
        newRow
      );
    } catch (error: any) {
      return createStandardResponse(false, 'Erreur lors de la création de la ligne', null, error?.message);
    }
  }

  private async handleAvDeleteRow(avId: string, rowIds: string[]): Promise<StandardResponse> {
    try {
      if (!avId || !rowIds || rowIds.length === 0) {
        return createStandardResponse(
          false, 'Paramètres manquants', null,
          'avId et rowIds (tableau non vide) sont requis'
        );
      }
      await this.avService.deleteRows(avId, rowIds);
      return createStandardResponse(
        true,
        `${rowIds.length} ligne(s) supprimée(s) avec succès`,
        { avId, deletedRowIds: rowIds, count: rowIds.length }
      );
    } catch (error: any) {
      return createStandardResponse(false, 'Erreur lors de la suppression', null, error?.message);
    }
  }

  private async handleAvUpdateRow(avId: string, rowId: string, updates: any[]): Promise<StandardResponse> {
    try {
      if (!avId || !rowId) {
        return createStandardResponse(false, 'Paramètres manquants', null, 'avId et rowId sont requis');
      }
      if (!updates || updates.length === 0) {
        return createStandardResponse(false, 'Paramètres manquants', null, 'updates doit contenir au moins une cellule');
      }
      await this.avService.batchUpdateRow(avId, rowId, updates);
      return createStandardResponse(
        true,
        `${updates.length} cellule(s) mise(s) à jour`,
        { avId, rowId, updatedKeys: updates.map((u: any) => u.keyId) }
      );
    } catch (error: any) {
      return createStandardResponse(false, 'Erreur lors de la mise à jour', null, error?.message);
    }
  }

  private async handleAvQueryDatabase(avId: string, column: string, value: string): Promise<StandardResponse> {
    try {
      if (!avId || !column || value === undefined) {
        return createStandardResponse(
          false, 'Paramètres manquants', null,
          'avId, column et value sont requis'
        );
      }
      const db = await this.avService.queryDatabase(avId, column, String(value));
      return createStandardResponse(
        true,
        `${db.rows.length} entrée(s) trouvée(s) pour "${column}" = "${value}"`,
        db
      );
    } catch (error: any) {
      return createStandardResponse(false, 'Erreur lors de la requête', null, error?.message);
    }
  }

  private async handleAvCreateDatabase(
    notebookId: string,
    name: string,
    columns?: Array<{ name: string; type: string }>
  ): Promise<StandardResponse> {
    try {
      if (!notebookId || !name) {
        return createStandardResponse(
          false, 'Paramètres manquants', null,
          'notebookId et name sont requis'
        );
      }
      const cols: AVColumnSpec[] = (columns ?? []).map(c => ({
        name: c.name,
        type: c.type
      }));
      const result = await this.avService.createDatabase(notebookId, name, cols);
      return createStandardResponse(
        true,
        `Database "${result.name}" créée (avId: ${result.avId}, docId: ${result.docId})`,
        result
      );
    } catch (error: any) {
      return createStandardResponse(false, 'Erreur lors de la création de la database', null, error?.message);
    }
  }
}

// 创建合并工具实例
export const mergedTools = new MergedTools(siyuanClient);

/**
 * 处理工具调用（统一入口）
 * @param name 工具名称
 * @param args 工具参数
 * @returns MCP兼容的响应格式
 */
export async function handleMergedTool(name: string, args: any): Promise<any> {
  try {
    const result = await mergedTools.handleToolCall(name, args || {});
    return convertToMCPFormat(result);
  } catch (error: any) {
    // 完全禁用日志输出 - 用户不需要任何日志
    
    const errorResult = createStandardResponse(
      false,
      "工具处理时发生错误",
      { toolName: name, args },
      error?.message || '未知错误'
    );
    
    return convertToMCPFormat(errorResult);
  }
}

/**
 * 获取所有工具定义
 */
export function getAllMergedTools() {
  return mergedTools.getTools();
}

/**
 * 将StandardResponse转换为MCP兼容格式
 * @param response - 标准响应对象
 * @returns MCP兼容的响应格式
 */
function convertToMCPFormat(response: any): any {
  // 如果已经是标准响应格式
  if (response && typeof response === 'object' && 'success' in response) {
    const statusIcon = response.success ? '✅' : '❌';
    const content = response.success 
      ? `${statusIcon} ${response.message}\n\n${formatResponseData(response.data)}`
      : `${statusIcon} ${response.message}\n\n❗ 错误: ${response.error || '未知错误'}`;

    return {
      content: [
        {
          type: "text",
          text: content
        }
      ],
      isError: !response.success
    };
  }

  // 如果是其他格式，直接返回JSON字符串
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(response, null, 2)
      }
    ],
    isError: false
  };
}

/**
 * 格式化响应数据为可读文本
 * @param data - 响应数据
 * @returns 格式化后的文本
 */
function formatResponseData(data: any): string {
  if (!data) return '';
  
  if (typeof data === 'string') return data;
  
  if (Array.isArray(data)) {
    return data.map((item, index) => `${index + 1}. ${JSON.stringify(item, null, 2)}`).join('\n');
  }
  
  if (typeof data === 'object') {
    return JSON.stringify(data, null, 2);
  }
  
  return String(data);
}
