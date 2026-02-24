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
import { AttributeViewService, AVColumnSpec, AVField } from '../services/av-service';

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
        description: 'List all Attribute View databases. Then call av_render_database(id) to read entries and field values.',
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
        description: 'Read ALL entries and field values of an Attribute View database (status, priority, dates, etc.). Use this — not SQL, not blocks_get — to read typed database content.',
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
        name: 'av_delete_entry',
        description: 'Delete entries from a database',
        inputSchema: {
          type: 'object',
          properties: {
            avId: {
              type: 'string',
              description: 'Database ID (Attribute View block ID)'
            },
            entryIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Entry IDs to delete (at least 1). Get IDs from av_render_database.'
            }
          },
          required: ['avId', 'entryIds']
        }
      },
      {
        name: 'av_update_entry',
        description: 'Update field values in a database entry',
        inputSchema: {
          type: 'object',
          properties: {
            avId: {
              type: 'string',
              description: 'Database ID (Attribute View block ID)'
            },
            entryId: {
              type: 'string',
              description: 'Entry ID to update (from av_render_database or av_query_database)'
            },
            updates: {
              type: 'array',
              description: 'List of fields to update (one or more)',
              items: {
                type: 'object',
                properties: {
                  fieldId: { type: 'string', description: 'Field ID (keyID, from av_render_database)' },
                  type: {
                    type: 'string',
                    enum: ['text', 'number', 'checkbox', 'select', 'mSelect', 'date', 'url', 'email', 'phone'],
                    description: 'Field type'
                  },
                  content: {
                    description: 'New value: string for text/select/url/email/phone, number for number/date (timestamp ms), boolean for checkbox, string[] for mSelect'
                  }
                },
                required: ['fieldId', 'type', 'content']
              },
              minItems: 1
            }
          },
          required: ['avId', 'entryId', 'updates']
        }
      },
      {
        name: 'av_create_entry',
        description: 'Add a new entry to a database',
        inputSchema: {
          type: 'object',
          properties: {
            avId: {
              type: 'string',
              description: 'Database ID (Attribute View block ID)'
            },
            name: {
              type: 'string',
              description: 'Name/title of the new entry (primary "block" field content). Empty if omitted.'
            },
            values: {
              type: 'array',
              description: 'Optional initial values for other fields',
              items: {
                type: 'object',
                properties: {
                  fieldId: { type: 'string', description: 'Field ID (keyID, from av_render_database)' },
                  type: {
                    type: 'string',
                    enum: ['text', 'number', 'checkbox', 'select', 'mSelect', 'date', 'url', 'email', 'phone'],
                    description: 'Field type'
                  },
                  content: {
                    description: 'Value by type: string for text/select/url/email/phone, number for number/date (ms timestamp), boolean for checkbox, string[] for mSelect'
                  }
                },
                required: ['fieldId', 'type', 'content']
              }
            }
          },
          required: ['avId']
        }
      },
      {
        name: 'av_query_database',
        description: 'Filter Attribute View database entries by field value (case-insensitive partial match). Use after av_list_databases to get avId.',
        inputSchema: {
          type: 'object',
          properties: {
            avId: {
              type: 'string',
              description: 'Database ID (Attribute View block ID)'
            },
            field: {
              type: 'string',
              description: 'Field name or ID to filter by (e.g. "Status", "Area")'
            },
            value: {
              type: 'string',
              description: 'Value to search for (partial match, case-insensitive)'
            }
          },
          required: ['avId', 'field', 'value']
        }
      },
      {
        name: 'av_create_database',
        description: 'Create a new Attribute View database (SiYuan DB with typed fields)',
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
            fields: {
              type: 'array',
              description: 'Optional additional fields (primary "Name" field is always created automatically)',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Field name' },
                  type: {
                    type: 'string',
                    enum: ['text','number','select','mSelect','date','checkbox','url','email','phone','mAsset','created','updated','lineNumber','template','rollup','relation'],
                    description: 'Field type'
                  }
                },
                required: ['name', 'type']
              }
            }
          },
          required: ['notebookId', 'name']
        }
      },

      // ==================== Attribute View — Entry Management ====================
      {
        name: 'av_get_entry',
        description: 'Get a single database entry by ID. Faster than av_render_database when you only need one entry.',
        inputSchema: {
          type: 'object',
          properties: {
            avId: { type: 'string', description: 'Database ID (Attribute View block ID)' },
            entryId: { type: 'string', description: 'Entry ID (from av_render_database or av_query_database)' }
          },
          required: ['avId', 'entryId']
        }
      },
      {
        name: 'av_bulk_create_entries',
        description: 'Create multiple entries in a single database write. More efficient than calling av_create_entry N times.',
        inputSchema: {
          type: 'object',
          properties: {
            avId: { type: 'string', description: 'Database ID (Attribute View block ID)' },
            entries: {
              type: 'array',
              description: 'List of entries to create',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Entry name (primary field content). Empty if omitted.' },
                  values: {
                    type: 'array',
                    description: 'Initial field values',
                    items: {
                      type: 'object',
                      properties: {
                        fieldId: { type: 'string', description: 'Field ID (from av_list_fields or av_render_database)' },
                        type: { type: 'string', enum: ['text','number','checkbox','select','mSelect','date','url','email','phone'], description: 'Field type' },
                        content: { description: 'Value (same format as av_create_entry)' }
                      },
                      required: ['fieldId', 'type', 'content']
                    }
                  }
                }
              },
              minItems: 1
            }
          },
          required: ['avId', 'entries']
        }
      },
      {
        name: 'av_bulk_update_entries',
        description: 'Update multiple entries in a single API call. More efficient than calling av_update_entry N times.',
        inputSchema: {
          type: 'object',
          properties: {
            avId: { type: 'string', description: 'Database ID (Attribute View block ID)' },
            updates: {
              type: 'array',
              description: 'List of entry updates',
              items: {
                type: 'object',
                properties: {
                  entryId: { type: 'string', description: 'Entry ID to update' },
                  changes: {
                    type: 'array',
                    description: 'Field changes',
                    items: {
                      type: 'object',
                      properties: {
                        fieldId: { type: 'string', description: 'Field ID' },
                        type: { type: 'string', enum: ['text','number','checkbox','select','mSelect','date','url','email','phone'] },
                        content: { description: 'New value' }
                      },
                      required: ['fieldId', 'type', 'content']
                    }
                  }
                },
                required: ['entryId', 'changes']
              },
              minItems: 1
            }
          },
          required: ['avId', 'updates']
        }
      },

      // ==================== Attribute View — Field Management ====================
      {
        name: 'av_list_fields',
        description: 'List all fields of a database (no entries loaded). Faster than av_render_database when you only need field names and IDs.',
        inputSchema: {
          type: 'object',
          properties: {
            avId: { type: 'string', description: 'Database ID (Attribute View block ID)' }
          },
          required: ['avId']
        }
      },
      {
        name: 'av_create_field',
        description: 'Add a new field to a database. Supported types: text, number, checkbox, select, mSelect, date, url, email, phone, mAsset. System types (relation, rollup, created, updated, lineNumber, template) are rejected.',
        inputSchema: {
          type: 'object',
          properties: {
            avId: { type: 'string', description: 'Database ID (Attribute View block ID)' },
            name: { type: 'string', description: 'Field name' },
            type: {
              type: 'string',
              enum: ['text','number','checkbox','select','mSelect','date','url','email','phone','mAsset'],
              description: 'Field type'
            },
            options: {
              description: 'For select/mSelect: [{name, color}]. For date: {format?, autoFill?}. For number: {format?}.'
            }
          },
          required: ['avId', 'name', 'type']
        }
      },
      {
        name: 'av_update_field',
        description: 'Update a field\'s name or options. Get fieldId from av_list_fields or av_render_database.',
        inputSchema: {
          type: 'object',
          properties: {
            avId: { type: 'string', description: 'Database ID (Attribute View block ID)' },
            fieldId: { type: 'string', description: 'Field ID (from av_list_fields or av_render_database)' },
            changes: {
              type: 'object',
              description: 'Changes to apply',
              properties: {
                name: { type: 'string', description: 'New field name (optional)' },
                options: {
                  type: 'array',
                  description: 'For select/mSelect: new option list [{name, color}] — replaces existing',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      color: { type: 'string', description: 'e.g. default, red, orange, yellow, green, blue' }
                    },
                    required: ['name']
                  }
                }
              }
            }
          },
          required: ['avId', 'fieldId', 'changes']
        }
      },
      {
        name: 'av_delete_field',
        description: 'Delete a field from a database. Cannot delete the primary key field (block type).',
        inputSchema: {
          type: 'object',
          properties: {
            avId: { type: 'string', description: 'Database ID (Attribute View block ID)' },
            fieldId: { type: 'string', description: 'Field ID to delete (from av_list_fields or av_render_database)' }
          },
          required: ['avId', 'fieldId']
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
        description: 'Browse SiYuan documents, blocks, and notebooks. NOT for database content — use av_render_database for typed column values.',
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
        interceptionResult.errors.join('; ') || 'Tool call intercepted',
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

        case 'av_create_entry':
          return await this.handleAvCreateEntry(args.avId, args.name, args.values);

        case 'av_delete_entry':
          return await this.handleAvDeleteEntry(args.avId, args.entryIds);

        case 'av_update_entry':
          return await this.handleAvUpdateEntry(args.avId, args.entryId, args.updates);

        case 'av_query_database':
          return await this.handleAvQueryDatabase(args.avId, args.field, args.value);

        case 'av_create_database':
          return await this.handleAvCreateDatabase(args.notebookId, args.name, args.fields);

        // ==================== Attribute View — Entry Management ====================
        case 'av_get_entry':
          return await this.handleAvGetEntry(args.avId, args.entryId);

        case 'av_bulk_create_entries':
          return await this.handleAvBulkCreateEntries(args.avId, args.entries);

        case 'av_bulk_update_entries':
          return await this.handleAvBulkUpdateEntries(args.avId, args.updates);

        // ==================== Attribute View — Field Management ====================
        case 'av_list_fields':
          return await this.handleAvListFields(args.avId);

        case 'av_create_field':
          return await this.handleAvCreateField(args.avId, args.name, args.type, args.options);

        case 'av_update_field':
          return await this.handleAvUpdateField(args.avId, args.fieldId, args.changes ?? {});

        case 'av_delete_field':
          return await this.handleAvDeleteField(args.avId, args.fieldId);

        // ==================== System & Infrastructure ====================
        case 'siyuan_workspace_map': {
          const nbResp = await this.client.request('/api/notebook/lsNotebooks');
          const notebooks = (nbResp?.data?.notebooks || nbResp?.notebooks || []) as any[];
          const databases = await this.avService.listDatabases() as any[];

          const lines: string[] = [
            '## SiYuan Workspace MAP',
            '',
            '### IMPORTANT — Tool quick-reference (always use these, never SQL)',
            '| Goal | Tool to call |',
            '|------|-------------|',
            '| Read database entries + field values | `av_render_database(avId)` |',
            '| Filter database entries | `av_query_database(avId, field:"Status", value:"In Progress")` |',
            '| List documents in notebook | `docs_list(notebookId)` |',
            '| Read document content | `doc_get(docId)` |',
            '| Create document | `docs_create(notebookId, path:"/Name", title:"Name")` |',
            '| Full workflow guide | read resource `siyuan://static/workflows` |',
            '',
            '---',
            '',
          ];

          // Notebooks + 2 levels of documents
          lines.push('### Notebooks & Documents');
          for (const nb of notebooks) {
            lines.push(`\n#### ${nb.name} \`${nb.id}\``);
            try {
              const l1Resp = await this.client.documents.listDocs(nb.id, '/');
              const l1Docs = (l1Resp?.data?.files || l1Resp?.files || []) as any[];
              for (const doc of l1Docs) {
                lines.push(`- ${doc.name} \`${doc.id}\``);
                try {
                  const l2Resp = await this.client.documents.listDocs(nb.id, doc.path);
                  const l2Docs = (l2Resp?.data?.files || l2Resp?.files || []) as any[];
                  for (const child of l2Docs) {
                    lines.push(`  - ${child.name} \`${child.id}\``);
                  }
                } catch { /* skip inaccessible children */ }
              }
            } catch { lines.push('  (could not list documents)'); }
          }

          // AV Databases — with inline tool hints
          lines.push('\n---', '\n### Attribute View Databases');
          lines.push('To read ANY database: call `av_render_database(avId)` — returns all entries + all field values.\n');
          for (const db of databases) {
            lines.push(`- **${db.name}** \`${db.id}\` (${db.fieldCount} fields, ${db.entryCount} entries)`);
            lines.push(`  → \`av_render_database('${db.id}')\``);
          }

          lines.push(
            '',
            '---',
            'Paste this entire block into Claude Desktop → Project Instructions.',
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
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error: any) {
      throw new Error(`Tool execution failed: ${error.message}`);
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
          "Failed to list notebooks",
          null,
          "No valid notebook data returned"
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
        `Retrieved ${validNotebooks.length} notebook(s)`,
        {
          notebooks: validNotebooks,
          total: validNotebooks.length
        }
      );
    } catch (error: any) {
      // 完全禁用日志输出 - 用户不需要任何日志
      return createStandardResponse(
        false,
        "Error listing notebooks",
        null,
        error?.message || 'Unknown error'
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
          "Invalid search parameters",
          { query, limit },
          "Search keyword cannot be empty"
        );
      }

      const results = await this.client.searchNotes(query.trim(), Math.max(1, Math.min(limit, 100)));
      
      // 处理思源API的标准响应格式
      const blocks = results?.data?.blocks || results?.blocks || [];
      
      if (!Array.isArray(blocks)) {
        return createStandardResponse(
          false,
          "Search returned invalid results",
          { query, limit },
          "Invalid API response format"
        );
      }

      // 处理搜索结果，确保格式正确
      const processedResults = blocks.slice(0, limit).map((result: any) => ({
        id: result.id || '',
        title: result.title || 'Untitled',
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
        `Found ${processedResults.length} result(s)`,
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
        "Error during search",
        { query, limit },
        error?.message || 'Unknown error'
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
          "Invalid notebook name",
          { name, icon },
          "Notebook name is required"
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
          "Notebook created successfully",
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
          "Notebook creation failed",
          { name: name.trim(), icon },
          result?.msg || 'Creation failed'
        );
      }
    } catch (error: any) {
      // 完全禁用日志输出 - 用户不需要任何日志
      return createStandardResponse(
        false,
        "Error creating notebook",
        { name, icon },
        error?.message || 'Unknown error'
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
          "Notebook ID, parent path and title are required"
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
          "Child document created successfully",
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
          "Child document creation failed",
          { title, notebook, parentPath },
          result?.msg || 'Creation failed'
        );
      }
    } catch (error: any) {
      return createStandardResponse(
        false,
        "Error creating child document",
        { title, notebook, parentPath },
        error?.message || 'Unknown error'
      );
    }
  }

  // ==================== Document CRUD implementations ====================

  private async handleDocGet(id: string): Promise<StandardResponse> {
    try {
      if (!id?.trim()) {
        return createStandardResponse(false, 'Missing parameter', null, 'id is required');
      }
      const doc = await this.docService.getDocument(id);
      return createStandardResponse(true, `Document "${doc.hPath}" read (${doc.content.length} chars)`, doc);
    } catch (error: any) {
      return createStandardResponse(false, 'Error reading document', null, error?.message);
    }
  }

  private async handleDocRename(id: string, title: string): Promise<StandardResponse> {
    try {
      if (!id?.trim() || !title?.trim()) {
        return createStandardResponse(false, 'Missing parameters', null, 'id and title are required');
      }
      await this.docService.renameDocument(id, title);
      return createStandardResponse(true, `Document renamed to "${title}"`, { id, title });
    } catch (error: any) {
      return createStandardResponse(false, 'Error renaming document', null, error?.message);
    }
  }

  private async handleDocDelete(id: string, cascade: boolean): Promise<StandardResponse> {
    try {
      if (!id?.trim()) {
        return createStandardResponse(false, 'Missing parameter', null, 'id is required');
      }
      const result = await this.docService.deleteDocument(id, cascade);
      const msg = result.childCount > 0
        ? `Document deleted with ${result.childCount} child(ren) (SiYuan trash)`
        : 'Document deleted (SiYuan trash)';
      return createStandardResponse(true, msg, result);
    } catch (error: any) {
      return createStandardResponse(false, 'Deletion refused or failed', null, error?.message);
    }
  }

  private async handleDocMove(fromIds: string[], toId: string): Promise<StandardResponse> {
    try {
      if (!fromIds?.length || !toId?.trim()) {
        return createStandardResponse(false, 'Missing parameters', null, 'fromIds and toId are required');
      }
      await this.docService.moveDocuments(fromIds, toId);
      return createStandardResponse(
        true,
        `${fromIds.length} document(s) moved to ${toId}`,
        { fromIds, toId, count: fromIds.length }
      );
    } catch (error: any) {
      return createStandardResponse(false, 'Error moving document(s)', null, error?.message);
    }
  }

  // ==================== Attribute View implementations ====================

  private async handleAvListDatabases(nameFilter?: string): Promise<StandardResponse> {
    try {
      const databases = await this.avService.listDatabases(nameFilter);
      const filterMsg = nameFilter ? ` (filter: "${nameFilter}")` : '';
      return createStandardResponse(
        true,
        `${databases.length} database(s) found${filterMsg}`,
        { databases, total: databases.length }
      );
    } catch (error: any) {
      return createStandardResponse(false, 'Error listing databases', null, error?.message);
    }
  }

  private async handleAvRenderDatabase(id: string): Promise<StandardResponse> {
    try {
      if (!id) {
        return createStandardResponse(false, 'Database ID required', null, 'Missing parameter: id');
      }
      const db = await this.avService.renderDatabase(id);
      return createStandardResponse(
        true,
        `Database "${db.name}": ${db.entries.length} entries, ${db.fields.length} field(s)`,
        db
      );
    } catch (error: any) {
      return createStandardResponse(false, 'Error reading database', null, error?.message);
    }
  }

  private async handleAvCreateEntry(avId: string, name?: string, values?: any[]): Promise<StandardResponse> {
    try {
      if (!avId) {
        return createStandardResponse(false, 'Missing parameter', null, 'avId is required');
      }
      const newEntry = await this.avService.createRow(avId, name ?? '', values ?? []);
      if (!newEntry) {
        return createStandardResponse(
          false,
          'Entry created but not found in post-render diff',
          null,
          'Entry may have been created but its ID cannot be determined'
        );
      }
      return createStandardResponse(
        true,
        `Entry created successfully (ID: ${newEntry.id})`,
        newEntry
      );
    } catch (error: any) {
      return createStandardResponse(false, 'Error creating entry', null, error?.message);
    }
  }

  private async handleAvDeleteEntry(avId: string, entryIds: string[]): Promise<StandardResponse> {
    try {
      if (!avId || !entryIds || entryIds.length === 0) {
        return createStandardResponse(
          false, 'Missing parameters', null,
          'avId and entryIds (non-empty array) are required'
        );
      }
      await this.avService.deleteRows(avId, entryIds);
      return createStandardResponse(
        true,
        `${entryIds.length} entry/entries deleted successfully`,
        { avId, deletedEntryIds: entryIds, count: entryIds.length }
      );
    } catch (error: any) {
      return createStandardResponse(false, 'Error deleting entries', null, error?.message);
    }
  }

  private async handleAvUpdateEntry(avId: string, entryId: string, updates: any[]): Promise<StandardResponse> {
    try {
      if (!avId || !entryId) {
        return createStandardResponse(false, 'Missing parameters', null, 'avId and entryId are required');
      }
      if (!updates || updates.length === 0) {
        return createStandardResponse(false, 'Missing parameters', null, 'updates must contain at least one field');
      }
      await this.avService.batchUpdateRow(avId, entryId, updates);
      return createStandardResponse(
        true,
        `${updates.length} field(s) updated`,
        { avId, entryId, updatedFields: updates.map((u: any) => u.fieldId) }
      );
    } catch (error: any) {
      return createStandardResponse(false, 'Error updating entry', null, error?.message);
    }
  }

  private async handleAvQueryDatabase(avId: string, field: string, value: string): Promise<StandardResponse> {
    try {
      if (!avId || !field || value === undefined) {
        return createStandardResponse(
          false, 'Missing parameters', null,
          'avId, field and value are required'
        );
      }
      const db = await this.avService.queryDatabase(avId, field, String(value));
      return createStandardResponse(
        true,
        `${db.entries.length} entry/entries found for "${field}" = "${value}"`,
        db
      );
    } catch (error: any) {
      return createStandardResponse(false, 'Error querying database', null, error?.message);
    }
  }

  private async handleAvCreateDatabase(
    notebookId: string,
    name: string,
    fields?: Array<{ name: string; type: string }>
  ): Promise<StandardResponse> {
    try {
      if (!notebookId || !name) {
        return createStandardResponse(
          false, 'Missing parameters', null,
          'notebookId and name are required'
        );
      }
      const cols: AVColumnSpec[] = (fields ?? []).map(c => ({
        name: c.name,
        type: c.type
      }));
      const result = await this.avService.createDatabase(notebookId, name, cols);
      return createStandardResponse(
        true,
        `Database "${result.name}" created (avId: ${result.avId}, docId: ${result.docId})`,
        result
      );
    } catch (error: any) {
      return createStandardResponse(false, 'Error creating database', null, error?.message);
    }
  }

  // ==================== Entry management handlers ====================

  private async handleAvGetEntry(avId: string, entryId: string): Promise<StandardResponse> {
    try {
      if (!avId || !entryId) {
        return createStandardResponse(false, 'Missing parameters', null, 'avId and entryId are required');
      }
      const entry = await this.avService.getEntry(avId, entryId);
      if (!entry) {
        return createStandardResponse(false, `Entry "${entryId}" not found in database`, null, 'Entry not found');
      }
      return createStandardResponse(true, `Entry "${entryId}" found`, entry);
    } catch (error: any) {
      return createStandardResponse(false, 'Error getting entry', null, error?.message);
    }
  }

  private async handleAvBulkCreateEntries(avId: string, entries: any[]): Promise<StandardResponse> {
    try {
      if (!avId || !entries?.length) {
        return createStandardResponse(false, 'Missing parameters', null, 'avId and entries (non-empty array) are required');
      }
      const created = await this.avService.bulkCreateEntries(avId, entries);
      return createStandardResponse(
        true,
        `${created.length} entry/entries created`,
        { avId, entries: created, count: created.length }
      );
    } catch (error: any) {
      return createStandardResponse(false, 'Error creating entries', null, error?.message);
    }
  }

  private async handleAvBulkUpdateEntries(avId: string, updates: any[]): Promise<StandardResponse> {
    try {
      if (!avId || !updates?.length) {
        return createStandardResponse(false, 'Missing parameters', null, 'avId and updates (non-empty array) are required');
      }
      const result = await this.avService.bulkUpdateEntries(avId, updates);
      return createStandardResponse(
        true,
        `${result.updatedCount} entry/entries updated`,
        { avId, ...result }
      );
    } catch (error: any) {
      return createStandardResponse(false, 'Error updating entries', null, error?.message);
    }
  }

  // ==================== Field management handlers ====================

  private async handleAvListFields(avId: string): Promise<StandardResponse> {
    try {
      if (!avId) return createStandardResponse(false, 'Missing parameter', null, 'avId is required');
      const fields = await this.avService.listFields(avId);
      return createStandardResponse(true, `${fields.length} field(s) found`, { avId, fields });
    } catch (error: any) {
      return createStandardResponse(false, 'Error listing fields', null, error?.message);
    }
  }

  private async handleAvCreateField(avId: string, name: string, type: string, options?: any): Promise<StandardResponse> {
    try {
      if (!avId || !name || !type) {
        return createStandardResponse(false, 'Missing parameters', null, 'avId, name and type are required');
      }
      const field = await this.avService.createField(avId, name, type, options);
      return createStandardResponse(true, `Field "${field.name}" (${field.type}) created (ID: ${field.id})`, field);
    } catch (error: any) {
      return createStandardResponse(false, 'Error creating field', null, error?.message);
    }
  }

  private async handleAvUpdateField(avId: string, fieldId: string, changes: any): Promise<StandardResponse> {
    try {
      if (!avId || !fieldId) {
        return createStandardResponse(false, 'Missing parameters', null, 'avId and fieldId are required');
      }
      const field = await this.avService.updateField(avId, fieldId, changes);
      return createStandardResponse(true, `Field "${field.name}" updated`, field);
    } catch (error: any) {
      return createStandardResponse(false, 'Error updating field', null, error?.message);
    }
  }

  private async handleAvDeleteField(avId: string, fieldId: string): Promise<StandardResponse> {
    try {
      if (!avId || !fieldId) {
        return createStandardResponse(false, 'Missing parameters', null, 'avId and fieldId are required');
      }
      await this.avService.deleteField(avId, fieldId);
      return createStandardResponse(true, `Field "${fieldId}" deleted`, { avId, fieldId });
    } catch (error: any) {
      return createStandardResponse(false, 'Error deleting field', null, error?.message);
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
      "Tool execution error",
      { toolName: name, args },
      error?.message || 'Unknown error'
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
      : `${statusIcon} ${response.message}\n\n❗ Error: ${response.error || 'Unknown error'}`;

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
