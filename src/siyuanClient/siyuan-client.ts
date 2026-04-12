/**
 * SiYuan client
 * Unified API client for all SiYuan API calls
 * 
 * @author CodeBuddy
 * @since 1.0.0
 */

import { createBlockOperations, BlockOperations } from './blocks';
import { createDocumentOperations, DocumentOperations } from './documents';
import { createAssetOperations, AssetOperations } from './assets';

export interface SiyuanClientConfig {
  baseURL: string;
  token?: string;
  timeout?: number;
}

export interface SiyuanResponse<T = any> {
  code: number;
  msg: string;
  data: T;
}

class SiyuanClient {
  private config: SiyuanClientConfig;

  constructor(config: SiyuanClientConfig) {
    this.config = config;
  }

  /**
   * Execute SQL query
   * @param params - SQL query parameters
   * @returns Query result
   */
  async sql(params: { stmt: string }): Promise<SiyuanResponse> {
    return this.request('/api/query/sql', params);
  }

  /**
   * Get block by ID
   * @param params - Query parameters
   * @returns Block info
   */
  async getBlockByID(params: { id: string }): Promise<SiyuanResponse> {
    const blockOps = createBlockOperations(this as any);
    return blockOps.getBlock(params.id);
  }

  /**
   * Insert block
   * @param params - Insert parameters
   * @returns Insert result
   */
  async insertBlock(params: {
    dataType: string;
    data: string;
    parentID: string;
    previousID?: string;
  }): Promise<SiyuanResponse> {
    const blockOps = createBlockOperations(this as any);
    return blockOps.insertBlock(params.data, params.parentID, params.previousID);
  }

  /**
   * Update block
   * @param params - Update parameters
   * @returns Update result
   */
  async updateBlock(params: {
    id: string;
    data: string;
    dataType?: string;
  }): Promise<SiyuanResponse> {
    const blockOps = createBlockOperations(this as any);
    return blockOps.updateBlock(params.id, params.data);
  }

  /**
   * Delete block
   * @param params - Delete parameters
   * @returns Delete result
   */
  async deleteBlock(params: { id: string }): Promise<SiyuanResponse> {
    const blockOps = createBlockOperations(this as any);
    return blockOps.deleteBlock(params.id);
  }

  /**
   * Generic request method
   * @param endpoint - API endpoint
   * @param data - Request data
   * @returns Response result
   */
  private async request(endpoint: string, data: any): Promise<SiyuanResponse> {
    try {
      const response = await fetch(`${this.config.baseURL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.config.token ? `Token ${this.config.token}` : ''
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      throw new Error(`Request failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
}
