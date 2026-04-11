/**
 * 思源客户端入口文件
 * 提供向后兼容的API接口
 */

import logger from '../logger';
import { createBlockOperations, BlockOperations } from './blocks';
import { createDocumentOperations, DocumentOperations } from './documents';
import { createAssetOperations, AssetOperations } from './assets';
import { createPortDiscovery } from '../utils/portDiscovery';
import { withRetry } from '../utils/retry';
import axios, { AxiosInstance } from 'axios';

export interface SiyuanClientConfig {
  baseURL?: string;
  token?: string;  // Optionnel — fallback sur SIYUAN_API_TOKEN ou SIYUAN_TOKEN
  autoDiscoverPort?: boolean;
}

export interface SiyuanClient {
  // 基础方法
  request(endpoint: string, data?: any): Promise<any>;
  /** Read a file from the workspace. Returns raw content (not {code,data} wrapper). */
  fileGet(workspacePath: string): Promise<any>;
  /** Write a file to the workspace via multipart putFile. Throws on error. */
  filePut(workspacePath: string, content: string): Promise<void>;
  /** Convenience: full-text search via /api/search/fullTextSearchBlock */
  searchNotes(query: string, limit?: number): Promise<any[]>;

  // 操作模块
  blocks: BlockOperations;
  documents: DocumentOperations;
  assets: AssetOperations;
}

export function createSiyuanClient(config: SiyuanClientConfig): SiyuanClient {
  // Résolution des env vars — priorité : argument explicite > SIYUAN_API_URL > SIYUAN_BASE_URL
  // Token : argument > SIYUAN_API_TOKEN > SIYUAN_TOKEN (rétro-compatibilité)
  let {
    baseURL = process.env.SIYUAN_API_URL || process.env.SIYUAN_BASE_URL || undefined,
    token   = process.env.SIYUAN_API_TOKEN || process.env.SIYUAN_TOKEN || '',
    autoDiscoverPort = true
  } = config;
  
  // 端口发现状态
  let portDiscoveryPromise: Promise<void> | null = null;
  
  // 创建HTTP客户端
  const httpClient = axios.create({
    baseURL: baseURL || undefined,
    timeout: 30000,
    headers: {
      'Authorization': `Token ${token}`,
      'Content-Type': 'application/json'
    }
  });

  /**
   * 自动发现端口
   */
  const discoverPort = async (): Promise<void> => {
    if (autoDiscoverPort && (!baseURL || baseURL === '' || baseURL === undefined)) {
      const portDiscovery = createPortDiscovery(token ?? '');
      
      try {
        const result = await portDiscovery.autoDiscover();
        if (result) {
          baseURL = result.baseURL;
          httpClient.defaults.baseURL = result.baseURL;
          logger.info(`端口发现成功，使用端口: ${result.port}，URL: ${result.baseURL}`);
        } else {
          logger.warn('端口发现失败，请确保思源笔记正在运行。将尝试使用默认端口 6806');
          baseURL = 'http://127.0.0.1:6806/';
          httpClient.defaults.baseURL = baseURL;
        }
      } catch (error) {
        logger.error('端口发现过程中出错:', error);
        logger.warn('将尝试使用默认端口 6806 连接');
        baseURL = 'http://127.0.0.1:6806/';
        httpClient.defaults.baseURL = baseURL;
      }
    } else if (baseURL) {
      logger.info(`使用自定义思源笔记 URL: ${baseURL}`);
    }
  };

  portDiscoveryPromise = discoverPort();

  const request = async (endpoint: string, data?: any): Promise<any> => {
    if (portDiscoveryPromise) {
      await portDiscoveryPromise;
      portDiscoveryPromise = null;
    }

    try {
      logger.info(`发送请求到: ${endpoint}`, { data });
      const response = await withRetry(async () => {
        return await httpClient.post(endpoint, data);
      }, { maxRetries: 3 });
      
      logger.info(`请求响应: ${endpoint}`, { status: response.status, data: response.data });
      return response.data;
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
        logger.warn(`连接失败，可能是思源笔记端口变化，尝试重新发现端口...`);
        
        try {
          await discoverPort();
          
          logger.info(`重试请求: ${endpoint}`);
          const response = await httpClient.post(endpoint, data);
          logger.info(`重试请求响应: ${endpoint}`, { status: response.status, data: response.data });
          return response.data;
        } catch (retryError: any) {
          logger.error(`重试请求失败: ${endpoint}`, { error: retryError.message });
          throw retryError;
        }
      }
      
      logger.error(`API请求失败: ${endpoint}`, { error: error.message, data });
      throw error;
    }
  };

  // 创建操作模块
  const blocks = createBlockOperations({ request } as any);
  const documents = createDocumentOperations({ request } as any);
  const assets = createAssetOperations({ request } as any);
  
  const client: SiyuanClient = {
    request,

    async fileGet(workspacePath: string): Promise<any> {
      if (portDiscoveryPromise) { await portDiscoveryPromise; portDiscoveryPromise = null; }
      // getFile returns the raw file content directly (not a {code,data,msg} wrapper)
      const response = await httpClient.post('/api/file/getFile', { path: workspacePath });
      return response.data;
    },

    async filePut(workspacePath: string, content: string): Promise<void> {
      if (portDiscoveryPromise) { await portDiscoveryPromise; portDiscoveryPromise = null; }
      // putFile requires multipart form data — JSON body is rejected by SiYuan
      const formData = new FormData();
      formData.append('path', workspacePath);
      formData.append('isDir', 'false');
      formData.append('modTime', String(Math.floor(Date.now() / 1000)));
      formData.append(
        'file',
        new Blob([content], { type: 'application/octet-stream' }),
        'file.json'
      );
      const response = await httpClient.post('/api/file/putFile', formData, {
        // Remove the default application/json header so axios sets multipart/form-data
        headers: { 'Content-Type': undefined }
      });
      if (response.data?.code !== 0) {
        throw new Error(`putFile échoué: ${response.data?.msg ?? 'erreur inconnue'}`);
      }
    },

    async searchNotes(query: string, limit = 10): Promise<any[]> {
      try {
        const resp = await request('/api/search/fullTextSearchBlock', {
          query: query.trim(),
          types: { document: true, heading: true, paragraph: true, list: true, listItem: true, codeBlock: true, mathBlock: true, table: true, blockquote: true, superBlock: true },
          method: 0, orderBy: 7, groupBy: 0, page: 1,
          pageSize: Math.min(Math.max(limit, 1), 100)
        });
        return resp?.data?.blocks || [];
      } catch {
        return [];
      }
    },

    // 操作模块
    blocks,
    documents,
    assets
  };

  return client;
}
