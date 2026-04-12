import { SiyuanClient } from './index';

export interface AssetOperations {
  // Asset upload
  uploadAsset(file: Buffer | Uint8Array, filename: string, assetsDirPath?: string): Promise<any>;
  uploadCloud(file: Buffer | Uint8Array, filename: string): Promise<any>;
  
  // Asset management
  resolveAssetPath(path: string): Promise<any>;
  getDocAssets(id: string): Promise<any>;
  getDocImageAssets(id: string): Promise<any>;
  getUnusedAssets(): Promise<any>;
  getMissingAssets(): Promise<any>;
  removeUnusedAsset(path: string): Promise<any>;
  removeUnusedAssets(): Promise<any>;
  renameAsset(oldPath: string, newPath: string): Promise<any>;
  
  // File annotations
  setFileAnnotation(path: string, annotation: string): Promise<any>;
  getFileAnnotation(path: string): Promise<any>;
  
  // OCR features
  getImageOCRText(path: string): Promise<any>;
  setImageOCRText(path: string, text: string): Promise<any>;
  ocr(path: string): Promise<any>;
  
  // Asset statistics
  statAsset(path: string): Promise<any>;
  fullReindexAssetContent(): Promise<any>;
}

export function createAssetOperations(client: SiyuanClient): AssetOperations {
  return {
    async uploadAsset(file: Buffer | Uint8Array, filename: string, assetsDirPath = '/assets/') {
      // Note: actual file upload requires FormData on the client side
      // This provides the basic upload interface structure
      return await client.request('/api/asset/upload', {
        filename,
        assetsDirPath,
        // Actual usage requires handling file data
        note: 'File upload requires FormData implementation'
      });
    },

    async uploadCloud(file: Buffer | Uint8Array, filename: string) {
      return await client.request('/api/asset/uploadCloud', {
        filename,
        note: 'Cloud upload requires FormData implementation'
      });
    },

    async resolveAssetPath(path: string) {
      return await client.request('/api/asset/resolveAssetPath', { path });
    },

    async getDocAssets(id: string) {
      return await client.request('/api/asset/getDocAssets', { id });
    },

    async getDocImageAssets(id: string) {
      return await client.request('/api/asset/getDocImageAssets', { id });
    },

    async getUnusedAssets() {
      return await client.request('/api/asset/getUnusedAssets');
    },

    async getMissingAssets() {
      return await client.request('/api/asset/getMissingAssets');
    },

    async removeUnusedAsset(path: string) {
      return await client.request('/api/asset/removeUnusedAsset', { path });
    },

    async removeUnusedAssets() {
      return await client.request('/api/asset/removeUnusedAssets');
    },

    async renameAsset(oldPath: string, newPath: string) {
      return await client.request('/api/asset/renameAsset', { 
        oldPath, 
        newPath 
      });
    },

    async setFileAnnotation(path: string, annotation: string) {
      return await client.request('/api/asset/setFileAnnotation', { 
        path, 
        annotation 
      });
    },

    async getFileAnnotation(path: string) {
      return await client.request('/api/asset/getFileAnnotation', { path });
    },

    async getImageOCRText(path: string) {
      return await client.request('/api/asset/getImageOCRText', { path });
    },

    async setImageOCRText(path: string, text: string) {
      return await client.request('/api/asset/setImageOCRText', { 
        path, 
        text 
      });
    },

    async ocr(path: string) {
      return await client.request('/api/asset/ocr', { path });
    },

    async statAsset(path: string) {
      return await client.request('/api/asset/statAsset', { path });
    },

    async fullReindexAssetContent() {
      return await client.request('/api/asset/fullReindexAssetContent');
    }
  };
}
