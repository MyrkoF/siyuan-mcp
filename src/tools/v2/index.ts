/**
 * v2 Tool Module — entry point
 *
 * Exports the same interface that index.ts expects:
 *   getAllTools()  → Tool[] (17 tools)
 *   handleTool()   → MCP-compatible response
 */

import { TOOLS } from './definitions.js';
import { handleToolCall } from './handlers.js';
import { convertToMCPFormat } from './response.js';
import logger from '../../logger.js';

export function getAllTools() {
  return TOOLS;
}

export async function handleTool(name: string, args: any): Promise<any> {
  try {
    const result = await handleToolCall(name, args || {});
    return convertToMCPFormat(result);
  } catch (error: any) {
    const errorResult = {
      success: false,
      message: 'Tool execution error',
      data: { toolName: name, args },
      error: error?.message || 'Unknown error'
    };
    return convertToMCPFormat(errorResult);
  }
}
