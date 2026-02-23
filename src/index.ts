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
        description: '检查系统健康状态和思源笔记连接',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'system_discover_ports',
        description: '自动发现思源笔记可用端口',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'blocks_get',
        description: '获取指定ID的块内容',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '块ID' }
          },
          required: ['id']
        }
      },
      {
        name: 'blocks_create',
        description: '创建新的块',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: '块内容（Markdown格式）' },
            parentID: { type: 'string', description: '父块ID（可选）' },
            previousID: { type: 'string', description: '前一个块ID（可选）' }
          },
          required: ['content']
        }
      },
      {
        name: 'blocks_update',
        description: '更新块内容',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '块ID' },
            content: { type: 'string', description: '新的块内容（Markdown格式）' }
          },
          required: ['id', 'content']
        }
      },
      {
        name: 'blocks_delete',
        description: '删除块',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '块ID' }
          },
          required: ['id']
        }
      },
      {
        name: 'blocks_move',
        description: '移动块到新位置',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '块ID' },
            parentID: { type: 'string', description: '新的父块ID' },
            previousID: { type: 'string', description: '前一个块ID（可选）' }
          },
          required: ['id', 'parentID']
        }
      },
      {
        name: 'docs_create',
        description: '创建新文档',
        inputSchema: {
          type: 'object',
          properties: {
            notebook: { type: 'string', description: '笔记本ID' },
            path: { type: 'string', description: '文档路径' },
            title: { type: 'string', description: '文档标题' },
            content: { type: 'string', description: '文档内容（可选）' }
          },
          required: ['notebook', 'path', 'title']
        }
      },
      {
        name: 'docs_list',
        description: '列出文档',
        inputSchema: {
          type: 'object',
          properties: {
            notebook: { type: 'string', description: '笔记本ID' },
            path: { type: 'string', description: '路径（可选，默认为根路径）' }
          },
          required: ['notebook']
        }
      },
      {
        name: 'assets_upload',
        description: '上传文件资源',
        inputSchema: {
          type: 'object',
          properties: {
            file: { type: 'string', description: '文件路径或base64编码内容' },
            assetsDirPath: { type: 'string', description: '资源目录路径' }
          },
          required: ['file', 'assetsDirPath']
        }
      },
      {
        name: 'assets_list',
        description: '获取文档的资源文件列表',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '文档ID' },
            type: { type: 'string', enum: ['all', 'images'], description: '资源类型', default: 'all' }
          },
          required: ['id']
        }
      },
      {
        name: 'assets_unused',
        description: '获取未使用的资源文件',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'assets_missing',
        description: '获取缺失的资源文件',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'assets_rename',
        description: '重命名资源文件',
        inputSchema: {
          type: 'object',
          properties: {
            oldPath: { type: 'string', description: '原路径' },
            newPath: { type: 'string', description: '新路径' }
          },
          required: ['oldPath', 'newPath']
        }
      },
      {
        name: 'assets_ocr',
        description: '对图片进行OCR识别',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '图片路径' }
          },
          required: ['path']
        }
      },
      {
        name: 'context_session_create',
        description: '创建新的会话上下文',
        inputSchema: {
          type: 'object',
          properties: {
            userId: { type: 'string', description: '用户ID（可选）' }
          },
          required: []
        }
      },
      {
        name: 'context_session_get',
        description: '获取会话上下文信息',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: '会话ID' },
            key: { type: 'string', description: '特定数据键（可选）' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'context_session_update',
        description: '更新会话上下文数据',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: '会话ID' },
            key: { type: 'string', description: '数据键' },
            value: { description: '数据值' }
          },
          required: ['sessionId', 'key', 'value']
        }
      },
      {
        name: 'context_reference_add',
        description: '添加引用到上下文',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: '会话ID' },
            type: { type: 'string', enum: ['block', 'document', 'selection'], description: '引用类型' },
            id: { type: 'string', description: '引用ID' },
            content: { type: 'string', description: '内容（选区类型必需）' },
            metadata: { type: 'object', description: '元数据（可选）' }
          },
          required: ['sessionId', 'type', 'id']
        }
      },
      {
        name: 'context_reference_list',
        description: '列出会话的引用上下文',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: '会话ID' },
            type: { type: 'string', enum: ['block', 'document', 'selection'], description: '引用类型过滤（可选）' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'context_merge',
        description: '合并会话上下文',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: '会话ID' },
            strategy: { type: 'string', enum: ['recent', 'relevant', 'all'], description: '合并策略', default: 'recent' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'context_summary',
        description: '导出上下文摘要',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: '会话ID' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'resources_discover',
        description: '发现可用的思源笔记资源',
        inputSchema: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['document', 'block', 'notebook'], description: '资源类型过滤' },
            notebook: { type: 'string', description: '笔记本ID过滤' },
            query: { type: 'string', description: '搜索查询' },
            offset: { type: 'number', description: '分页偏移', default: 0 },
            limit: { type: 'number', description: '返回数量限制', default: 50 },
            sortBy: { type: 'string', enum: ['created', 'updated', 'name'], description: '排序字段', default: 'updated' },
            sortOrder: { type: 'string', enum: ['asc', 'desc'], description: '排序顺序', default: 'desc' }
          },
          required: []
        }
      },
      {
        name: 'resources_search',
        description: '搜索思源笔记资源',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索查询' },
            type: { type: 'string', enum: ['document', 'block', 'notebook'], description: '资源类型过滤' },
            notebook: { type: 'string', description: '笔记本ID过滤' },
            offset: { type: 'number', description: '分页偏移', default: 0 },
            limit: { type: 'number', description: '返回数量限制', default: 20 }
          },
          required: ['query']
        }
      },
      {
        name: 'resources_stats',
        description: '获取资源统计信息',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'prompts_list',
        description: '列出所有可用的提示模板',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'prompts_get',
        description: '获取指定的提示模板',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '提示模板名称' },
            variables: { type: 'object', description: '模板变量' }
          },
          required: ['name']
        }
      },
      {
        name: 'prompts_validate',
        description: '验证提示模板变量',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '提示模板名称' },
            variables: { type: 'object', description: '要验证的变量' }
          },
          required: ['name', 'variables']
        }
      },
      // 合并后的所有工具
      ...getAllMergedTools(),
      // 新增批量操作工具
      {
        name: 'batch_create_docs',
        description: '批量创建文档',
        inputSchema: {
          type: 'object',
          properties: {
            requests: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  notebook: { type: 'string', description: '笔记本ID' },
                  path: { type: 'string', description: '文档路径' },
                  title: { type: 'string', description: '文档标题' },
                  content: { type: 'string', description: '文档内容（可选）' }
                },
                required: ['notebook', 'path', 'title']
              },
              description: '批量创建文档请求列表'
            }
          },
          required: ['requests']
        }
      },
      {
        name: 'batch_search_queries',
        description: '批量搜索查询',
        inputSchema: {
          type: 'object',
          properties: {
            queries: {
              type: 'array',
              items: { type: 'string' },
              description: '搜索查询列表'
            },
            limit: { type: 'number', description: '每个查询的结果限制', default: 10 }
          },
          required: ['queries']
        }
      },
      {
        name: 'system_cache_stats',
        description: '获取缓存统计信息',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'system_retry_stats',
        description: '获取重试统计信息',
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
            message: '文档创建成功',
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
              '检查path参数格式（必须以/开头）',
              '确认title参数不为空',
              '验证思源笔记服务是否运行',
              '检查笔记本ID是否有效'
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

      // 资源发现工具
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
                message: `发现 ${discoverResult.resources.length} 个资源`
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
                message: '资源发现时发生错误',
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
                  message: '搜索查询不能为空',
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
                message: `找到 ${resourceSearchResult.resources.length} 个资源`
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
                message: '资源搜索时发生错误',
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
