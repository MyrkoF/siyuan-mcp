/**
 * SiYuan client entry point
 * Provides backward-compatible API interface
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
  // Core methods
  request(endpoint: string, data?: any): Promise<any>;
  /** Read a file from the workspace. Returns raw content (not {code,data} wrapper). */
  fileGet(workspacePath: string): Promise<any>;
  /** Write a file to the workspace via multipart putFile. Throws on error. */
  filePut(workspacePath: string, content: string): Promise<void>;
  /** Convenience: full-text search via /api/search/fullTextSearchBlock */
  searchNotes(query: string, limit?: number): Promise<any[]>;

  // Operation modules
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
  
  // Port discovery state
  let portDiscoveryPromise: Promise<void> | null = null;
  
  // Create HTTP client
  const httpClient = axios.create({
    baseURL: baseURL || undefined,
    timeout: 30000,
    headers: {
      'Authorization': `Token ${token}`,
      'Content-Type': 'application/json'
    }
  });

  /**
   * Auto-discover port
   */
  const discoverPort = async (): Promise<void> => {
    if (autoDiscoverPort && (!baseURL || baseURL === '' || baseURL === undefined)) {
      const portDiscovery = createPortDiscovery(token ?? '');
      
      try {
        const result = await portDiscovery.autoDiscover();
        if (result) {
          baseURL = result.baseURL;
          httpClient.defaults.baseURL = result.baseURL;
          logger.info(`Port discovered, using port: ${result.port}. URL: ${result.baseURL}`);
        } else {
          logger.warn('Port discovery failed. Ensure SiYuan is running. Will try default port 6806');
          baseURL = 'http://127.0.0.1:6806/';
          httpClient.defaults.baseURL = baseURL;
        }
      } catch (error) {
        logger.error('Port discovery error:', error);
        logger.warn('Will try connecting with default port 6806');
        baseURL = 'http://127.0.0.1:6806/';
        httpClient.defaults.baseURL = baseURL;
      }
    } else if (baseURL) {
      logger.info(`Using custom SiYuan URL: ${baseURL}`);
    }
  };

  portDiscoveryPromise = discoverPort();

  const request = async (endpoint: string, data?: any): Promise<any> => {
    if (portDiscoveryPromise) {
      await portDiscoveryPromise;
      portDiscoveryPromise = null;
    }

    try {
      logger.info(`Sending request to: ${endpoint}`, { data });
      const response = await withRetry(async () => {
        return await httpClient.post(endpoint, data);
      }, { maxRetries: 3 });
      
      logger.info(`Response from: ${endpoint}`, { status: response.status, data: response.data });
      return response.data;
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
        logger.warn(`Connection failed, port may have changed. Retrying with port discovery...`);
        
        try {
          await discoverPort();
          
          logger.info(`Retrying request: ${endpoint}`);
          const response = await httpClient.post(endpoint, data);
          logger.info(`Retry response: ${endpoint}`, { status: response.status, data: response.data });
          return response.data;
        } catch (retryError: any) {
          logger.error(`Retry request failed: ${endpoint}`, { error: retryError.message });
          throw retryError;
        }
      }
      
      logger.error(`API request failed: ${endpoint}`, { error: error.message, data });
      throw error;
    }
  };

  // Create operation modules
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

    // Operation modules
    blocks,
    documents,
    assets
  };

  return client;
}
