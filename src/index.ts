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
import { resourceDirectory } from './resources';
import { promptTemplateManager } from './prompts';
import { getAllMergedTools, handleMergedTool } from './tools/Tools.js';

const server = new Server(
  { name: 'mcp_server_siyuan', version: '1.0.0' },
  { capabilities: { tools: {}, resources: {}, prompts: {} } }
);

// ── Tools: Tools.ts is the single source of truth ──────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: getAllMergedTools() };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    return await handleMergedTool(name, args);
  } catch (error) {
    logger.error({ error, tool: name }, 'Tool execution failed');
    throw error;
  }
});

// ── MCP Resources ───────────────────────────────────────────────────────────
// Only static guide resources — no SiYuan API calls at startup.
// Dynamic content (notebooks, docs, databases) is accessible via tools.
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const resources = resourceDirectory.listStaticResources();
  return {
    resources: resources.map(r => ({
      uri: r.uri, name: r.name, description: r.description, mimeType: r.mimeType
    }))
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  try {
    const content = await resourceDirectory.getResourceContent(uri);
    const metadata = await resourceDirectory.getResourceMetadata(uri);
    return { contents: [{ uri, mimeType: metadata.mimeType || 'text/plain', text: content }] };
  } catch (error) {
    logger.error({ error, uri }, 'Failed to read resource');
    throw error;
  }
});

// ── MCP Prompts ─────────────────────────────────────────────────────────────
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  try {
    const prompts = promptTemplateManager.getAvailablePrompts();
    return {
      prompts: prompts.map(p => ({
        name: p.name,
        description: p.description,
        arguments: p.arguments?.map(a => ({ name: a.name, description: a.description, required: a.required || false })) || []
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
    return { messages: result.messages };
  } catch (error) {
    logger.error({ error, name, args }, 'Failed to get prompt');
    throw error;
  }
});

// ── Bootstrap ───────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('Siyuan MCP Server running on stdio');
}

main().catch((error) => {
  logger.error({ error }, 'Server failed to start');
  process.exit(1);
});
