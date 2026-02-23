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
        description: 'Delete a block by ID',
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
      // 合并后的所有工具
      ...getAllMergedTools(),
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
        const portDiscovery = createPortDiscovery(process.env.SIYUAN_TOKEN || '');
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
      case 'create_document':
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
