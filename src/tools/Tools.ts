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
        description: 'List all SiYuan notebooks',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'search_content',
        description: 'Full-text keyword search across SiYuan notes',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search keyword' },
            limit: { type: 'number', description: 'Maximum number of results to return', default: 10 }
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

      // ==================== 增强API工具 ====================
      {
        name: 'batch_create_blocks',
        description: 'Batch create multiple blocks',
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
        description: 'Batch update multiple blocks',
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
        description: 'Batch delete multiple blocks',
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
            keyword: { type: 'string', description: 'Search keyword' },
            limit: { type: 'number', description: 'Maximum number of results to return', default: 20 }
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
        description: 'Get all tags attached to a specific block',
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
        description: 'Advanced multi-criteria search (tags, date range, block type)',
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
            limit: { type: 'number', description: 'Maximum number of results to return', default: 50 }
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
            limit: { type: 'number', description: 'Maximum number of results to return', default: 20 }
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
            limit: { type: 'number', description: 'Maximum number of results to return', default: 30 }
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
            dateType: {
              type: 'string',
              enum: ['created', 'updated'],
              description: 'Date type: "created" or "updated"',
              default: 'updated'
            },
            limit: { type: 'number', description: 'Maximum number of results to return', default: 50 }
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
                limit: { type: 'number', description: 'Maximum number of results to return', default: 50 }
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
        description: 'Lit le contenu Markdown d\'un document SiYuan par son ID. Retourne le contenu propre et le chemin lisible (hPath).',
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
        description: 'Rename a SiYuan document by ID.',
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
        description: 'Delete a document (sends to SiYuan trash). Refuses if children exist unless cascade:true. Everything goes to trash (recoverable).',
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
        description: 'Move one or more SiYuan documents to a new parent (document or notebook).',
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
        description: 'List all Attribute View databases in the workspace (name, column count, row count).',
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
        description: 'Read a full Attribute View database: all columns (with types) and all rows (with parsed values).',
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
        description: 'Supprime une ou plusieurs lignes d\'une database Attribute View. Opération irréversible.',
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
        description: 'Met à jour une ou plusieurs cellules d\'une ligne dans une database Attribute View en un seul appel (/api/av/batchSetAttributeViewBlockAttrs). Utiliser av_render_database pour obtenir les keyIds des colonnes.',
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
        description: 'Create a new detached row in an Attribute View database. Returns the created row with its ID and cell values.',
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
        description: 'Filtre les entrées d\'une database Attribute View par colonne et valeur (recherche partielle insensible à la casse).',
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
        description: 'Crée une nouvelle database Attribute View dans un notebook SiYuan. Crée le document + insère la database dedans. Retourne l\'avId pour utilisation avec les autres outils av_*.',
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
      }
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
