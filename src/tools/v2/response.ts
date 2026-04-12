/**
 * MCP Response formatting utilities
 * Extracted from v1 Tools.ts — pure functions, zero dependencies.
 */

export interface StandardResponse {
  success: boolean;
  message: string;
  error?: string;
  data: any;
  timestamp?: string;
}

export function createStandardResponse(
  success: boolean,
  message: string,
  data: any = null,
  error?: string
): StandardResponse {
  const response: StandardResponse = {
    success,
    message,
    data,
    timestamp: new Date().toISOString()
  };
  if (error) response.error = error;
  return response;
}

export function convertToMCPFormat(response: any): any {
  if (response && typeof response === 'object' && 'success' in response) {
    const icon = response.success ? '✅' : '❌';
    const content = response.success
      ? `${icon} ${response.message}\n\n${formatResponseData(response.data)}`
      : `${icon} ${response.message}\n\n❗ Error: ${response.error || 'Unknown error'}`;

    return {
      content: [{ type: 'text', text: content }],
      isError: !response.success
    };
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
    isError: false
  };
}

function formatResponseData(data: any): string {
  if (data === null || data === undefined) return '';
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) {
    return data.map((item, i) => `${i + 1}. ${JSON.stringify(item)}`).join('\n');
  }
  if (typeof data === 'object') return JSON.stringify(data, null, 2);
  return String(data);
}
