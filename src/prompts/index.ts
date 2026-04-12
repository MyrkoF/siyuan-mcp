import { createSiyuanClient } from '../siyuanClient';
import logger from '../logger';

// MCP prompt template definitions
export interface MCPPrompt {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required?: boolean;
    type?: string;
    default?: any;
  }>;
}

// Prompt template variables
export interface PromptVariables {
  [key: string]: any;
}

// Prompt template result
export interface PromptResult {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: {
      type: 'text';
      text: string;
    };
  }>;
}

export class PromptTemplateManager {
  private siyuanClient;
  private templates: Map<string, (variables: PromptVariables) => Promise<PromptResult>>;

  constructor() {
    this.siyuanClient = createSiyuanClient({
      baseURL: process.env.SIYUAN_API_URL || process.env.SIYUAN_BASE_URL || undefined,
      token: process.env.SIYUAN_API_TOKEN || process.env.SIYUAN_TOKEN || '',
      autoDiscoverPort: true
    });

    this.templates = new Map();
    this.initializeTemplates();
  }

  // Initialize built-in templates
  private initializeTemplates() {
    // Note search assistant
    this.templates.set('note-search-assistant', async (variables) => {
      const { query, context = '', limit = 10 } = variables;
      
      let searchResults = '';
      if (query) {
        try {
          const results = await this.siyuanClient.searchNotes(query, limit);
          searchResults = results.map((r: any) => 
            `- ${r.content?.substring(0, 100)}... (${r.path})`
          ).join('\n');
        } catch (error) {
          searchResults = 'Error during search';
        }
      }

      return {
        messages: [
          {
            role: 'system',
            content: {
              type: 'text',
              text: `You are a SiYuan Note search assistant. You help users search and find information within their SiYuan notes.

Current search results:
${searchResults || 'No search results'}

Use the search results to provide helpful information and suggestions to the user.`
            }
          },
          {
            role: 'user',
            content: {
              type: 'text',
              text: context || `Please help me find information about "${query}"`
            }
          }
        ]
      };
    });

    // Document creation assistant
    this.templates.set('document-creator', async (variables) => {
      const { title, topic, notebook, outline = '' } = variables;
      
      let notebookInfo = '';
      if (notebook) {
        try {
          const notebooks = await this.siyuanClient.request('/api/notebook/lsNotebooks', {});
          const nb = notebooks.find((n: any) => n.id === notebook || n.name === notebook);
          notebookInfo = nb ? `Target notebook: ${nb.name}` : '';
        } catch (error) {
          notebookInfo = '';
        }
      }

      return {
        messages: [
          {
            role: 'system',
            content: {
              type: 'text',
              text: `You are a SiYuan Note document creation assistant. You help users create structured document content.

${notebookInfo}

Based on the information provided, create a well-structured and comprehensive document. Use Markdown format with appropriate heading levels, lists, and formatting.`
            }
          },
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please help me create a document about "${topic || title}".
${title ? `Document title: ${title}` : ''}
${outline ? `Outline requirements: ${outline}` : ''}

Please provide complete document content.`
            }
          }
        ]
      };
    });

    // Content summarizer
    this.templates.set('content-summarizer', async (variables) => {
      const { content, style = 'concise' } = variables;

      const styleInstructions = {
        concise: 'Provide a concise bullet-point summary',
        detailed: 'Provide a detailed analysis and summary',
        bullet: 'Summarize using a bullet-point list format',
        academic: 'Summarize using an academic style'
      };

      return {
        messages: [
          {
            role: 'system',
            content: {
              type: 'text',
              text: `You are a content summarization assistant. You help users summarize and analyze document content.

Summary style: ${styleInstructions[style as keyof typeof styleInstructions] || styleInstructions.concise}`
            }
          },
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please summarize the following content:

${content}`
            }
          }
        ]
      };
    });

    // Knowledge connector
    this.templates.set('knowledge-connector', async (variables) => {
      const { topic, depth = 'medium' } = variables;

      let relatedContent = '';

      if (topic) {
        try {
          const searchResults = await this.siyuanClient.searchNotes(topic, 5);
          relatedContent = searchResults.map((r: any) => 
            `- ${r.content?.substring(0, 150)}... (${r.path})`
          ).join('\n');
        } catch (error) {
          relatedContent = '';
        }
      }

      const depthInstructions = {
        shallow: 'Provide basic connection information',
        medium: 'Provide a moderate-depth connection analysis',
        deep: 'Provide an in-depth knowledge network analysis'
      };

      return {
        messages: [
          {
            role: 'system',
            content: {
              type: 'text',
              text: `You are a knowledge connection assistant. You help users discover and build connections between ideas.

Analysis depth: ${depthInstructions[depth as keyof typeof depthInstructions] || depthInstructions.medium}

Related content:
${relatedContent || 'No related content found'}

Help the user build knowledge connections and discover potential relationships and insights.`
            }
          },
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please help me analyze the knowledge connections and relationships for the topic "${topic}".`
            }
          }
        ]
      };
    });

    // Learning path planner
    this.templates.set('learning-path-planner', async (variables) => {
      const { subject, level = 'beginner', goals = '', timeframe = '' } = variables;
      
      let relatedNotes = '';
      if (subject) {
        try {
          const searchResults = await this.siyuanClient.searchNotes(subject, 8);
          relatedNotes = searchResults.map((r: any) => 
            `- ${r.content?.substring(0, 100)}...`
          ).join('\n');
        } catch (error) {
          relatedNotes = '';
        }
      }

      return {
        messages: [
          {
            role: 'system',
            content: {
              type: 'text',
              text: `You are a learning path planning assistant. You help users create personalized learning plans.

Existing related notes:
${relatedNotes || 'No related notes found'}

Based on the user's learning goals and existing resources, create a structured learning path.`
            }
          },
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please create a learning path for "${subject}".
Current level: ${level}
${goals ? `Learning goals: ${goals}` : ''}
${timeframe ? `Timeframe: ${timeframe}` : ''}

Please provide a detailed study plan and recommendations.`
            }
          }
        ]
      };
    });

    // Writing assistant
    this.templates.set('writing-assistant', async (variables) => {
      const { type = 'article', topic, audience = 'general', tone = 'professional' } = variables;
      
      let referenceContent = '';
      if (topic) {
        try {
          const searchResults = await this.siyuanClient.searchNotes(topic, 3);
          referenceContent = searchResults.map((r: any) => 
            `- ${r.content?.substring(0, 200)}...`
          ).join('\n');
        } catch (error) {
          referenceContent = '';
        }
      }

      const typeInstructions = {
        article: 'Write a well-structured article',
        blog: 'Write a blog post',
        report: 'Write a formal report',
        summary: 'Write a summary document',
        tutorial: 'Write a tutorial guide'
      };

      return {
        messages: [
          {
            role: 'system',
            content: {
              type: 'text',
              text: `You are a professional writing assistant. You help users create various types of documents.

Writing type: ${typeInstructions[type as keyof typeof typeInstructions] || typeInstructions.article}
Target audience: ${audience}
Writing tone: ${tone}

Reference material:
${referenceContent || 'No reference material found'}

Create high-quality content with a clear structure and logical flow.`
            }
          },
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please help me write a ${type} about "${topic}".`
            }
          }
        ]
      };
    });
  }

  // Get all available prompt templates
  getAvailablePrompts(): MCPPrompt[] {
    return [
      {
        name: 'note-search-assistant',
        description: 'Note search assistant - search and find information in SiYuan notes',
        arguments: [
          { name: 'query', description: 'Search keyword', required: true, type: 'string' },
          { name: 'context', description: 'Additional context information', type: 'string' },
          { name: 'limit', description: 'Maximum number of search results', type: 'number', default: 10 }
        ]
      },
      {
        name: 'document-creator',
        description: 'Document creation assistant - create structured document content',
        arguments: [
          { name: 'title', description: 'Document title', type: 'string' },
          { name: 'topic', description: 'Document topic', required: true, type: 'string' },
          { name: 'notebook', description: 'Target notebook', type: 'string' },
          { name: 'outline', description: 'Document outline requirements', type: 'string' }
        ]
      },
      {
        name: 'content-summarizer',
        description: 'Content summarization assistant - summarize and analyze document content',
        arguments: [
          { name: 'content', description: 'Content to summarize', required: true, type: 'string' },
          { name: 'style', description: 'Summary style (concise/detailed/bullet/academic)', type: 'string', default: 'concise' }
        ]
      },
      {
        name: 'knowledge-connector',
        description: 'Knowledge connection assistant - discover and build connections between ideas',
        arguments: [
          { name: 'topic', description: 'Topic to analyze', required: true, type: 'string' },
          { name: 'depth', description: 'Analysis depth (shallow/medium/deep)', type: 'string', default: 'medium' }
        ]
      },
      {
        name: 'learning-path-planner',
        description: 'Learning path planner - create personalized study plans',
        arguments: [
          { name: 'subject', description: 'Subject to learn', required: true, type: 'string' },
          { name: 'level', description: 'Current level (beginner/intermediate/advanced)', type: 'string', default: 'beginner' },
          { name: 'goals', description: 'Learning goals', type: 'string' },
          { name: 'timeframe', description: 'Time available for study', type: 'string' }
        ]
      },
      {
        name: 'writing-assistant',
        description: 'Writing assistant - help create various types of documents',
        arguments: [
          { name: 'topic', description: 'Writing topic', required: true, type: 'string' },
          { name: 'type', description: 'Document type (article/blog/report/summary/tutorial)', type: 'string', default: 'article' },
          { name: 'audience', description: 'Target audience', type: 'string', default: 'general' },
          { name: 'tone', description: 'Writing tone', type: 'string', default: 'professional' }
        ]
      }
    ];
  }

  // Get prompt template
  async getPrompt(name: string, variables: PromptVariables = {}): Promise<PromptResult> {
    const template = this.templates.get(name);
    if (!template) {
      throw new Error(`Prompt template not found: ${name}`);
    }

    try {
      const result = await template(variables);
      logger.info({ name, variables }, 'Generated prompt template');
      return result;
    } catch (error) {
      logger.error({ error, name, variables }, 'Failed to generate prompt template');
      throw error;
    }
  }

  // Register custom template
  registerTemplate(
    name: string, 
    template: (variables: PromptVariables) => Promise<PromptResult>
  ): void {
    this.templates.set(name, template);
    logger.info({ name }, 'Registered custom prompt template');
  }

  // Remove template
  removeTemplate(name: string): boolean {
    const removed = this.templates.delete(name);
    if (removed) {
      logger.info({ name }, 'Removed prompt template');
    }
    return removed;
  }

  // Validate template variables
  validateVariables(name: string, variables: PromptVariables): { valid: boolean; errors: string[] } {
    const prompts = this.getAvailablePrompts();
    const prompt = prompts.find(p => p.name === name);
    
    if (!prompt) {
      return { valid: false, errors: [`Prompt template not found: ${name}`] };
    }

    const errors: string[] = [];
    
    if (prompt.arguments) {
      for (const arg of prompt.arguments) {
        if (arg.required && !(arg.name in variables)) {
          errors.push(`Required argument missing: ${arg.name}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}

// Create default prompt template manager instance
export const promptTemplateManager = new PromptTemplateManager();
