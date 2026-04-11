/**
 * v2 Tool Definitions — 17 tools (down from 70 in v1)
 *
 * Design principles:
 * - siyuan_sql absorbs all read operations on blocks/docs/tags/refs
 * - Attribute Views use dedicated API tools (data stored in JSON, not SQLite)
 * - Each write operation has a dedicated tool
 * - Descriptions are concise to minimize token usage
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const TOOLS: Tool[] = [
  // ======================== READ ========================
  {
    name: 'siyuan_sql',
    description:
      'Execute a SQL SELECT on SiYuan\'s SQLite database. ' +
      'Use for ALL reads: blocks, documents, tags, backlinks, search. ' +
      'Read the siyuan://static/sql-schema resource for table schema and example queries. ' +
      'NOTE: Attribute View (database) data is NOT in SQLite — use read_database instead.',
    inputSchema: {
      type: 'object',
      properties: {
        stmt: {
          type: 'string',
          description: 'SQL SELECT statement (read-only). Example: SELECT * FROM blocks WHERE type=\'d\' LIMIT 10'
        }
      },
      required: ['stmt']
    }
  },
  {
    name: 'read_database',
    description:
      'Read Attribute View (database) data: fields, entries, values. ' +
      'Supports modes: list all DBs (mode:"list"), read full DB (id only), ' +
      'filter entries (id + filter), get single entry (id + entryId).',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Database ID (Attribute View block ID). Required except for mode:"list".'
        },
        mode: {
          type: 'string',
          enum: ['list'],
          description: 'Set to "list" to list all databases (no id needed).'
        },
        entryId: {
          type: 'string',
          description: 'Entry ID to fetch a single entry.'
        },
        filter: {
          type: 'object',
          properties: {
            field: { type: 'string', description: 'Field name or ID to filter by' },
            value: { type: 'string', description: 'Value to match (partial, case-insensitive)' }
          },
          required: ['field', 'value'],
          description: 'Filter entries by field value.'
        }
      },
      required: []
    }
  },

  // ======================== ORIENTATION ========================
  {
    name: 'workspace_map',
    description:
      'Get a map of the SiYuan workspace: all notebooks, top-level documents (2 levels), ' +
      'and all Attribute View database IDs. Call this first to orient yourself.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'list_notebooks',
    description:
      'List all notebooks, or create a new one. ' +
      'Without params: returns all notebooks with IDs. ' +
      'With name: creates a new notebook.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name for a new notebook (omit to list existing).' },
        icon: { type: 'string', description: 'Emoji icon for new notebook.', default: '📔' }
      },
      required: []
    }
  },

  // ======================== DOCUMENTS ========================
  {
    name: 'create_document',
    description:
      'Create a document (or subdocument) in a notebook. ' +
      'Use nested path for subdocuments: path:"/Parent/Child". ' +
      'Returns the document block ID — use it as parentDocId in create_database to nest a DB under this doc.',
    inputSchema: {
      type: 'object',
      properties: {
        notebook: { type: 'string', description: 'Notebook ID' },
        path: { type: 'string', description: 'Document path (e.g. "/My Doc" or "/Parent/Child")' },
        title: { type: 'string', description: 'Document title' },
        content: { type: 'string', description: 'Markdown content (optional)' }
      },
      required: ['notebook', 'path', 'title']
    }
  },
  {
    name: 'update_document',
    description:
      'Rename and/or replace document content. ' +
      'Provide title to rename, content to replace body, or both.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Document block ID' },
        title: { type: 'string', description: 'New title (rename)' },
        content: { type: 'string', description: 'New markdown content (replaces entire body)' }
      },
      required: ['id']
    }
  },
  {
    name: 'delete_document',
    description:
      'Delete a document. Use dryRun:true to preview without deleting. ' +
      'Set cascade:true to also delete child documents.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Document block ID' },
        cascade: { type: 'boolean', description: 'Also delete children (default: false)', default: false },
        dryRun: { type: 'boolean', description: 'Preview only, no deletion (default: false)', default: false }
      },
      required: ['id']
    }
  },

  // ======================== BLOCKS ========================
  {
    name: 'insert_block',
    description:
      'Insert a markdown block into a document. ' +
      'To embed an existing database, use: <div data-type="NodeAttributeView" data-av-id="DB_ID" data-av-type="table"></div>',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Markdown content' },
        parentID: { type: 'string', description: 'Parent block ID (the document or container block)' },
        previousID: { type: 'string', description: 'Insert after this sibling block ID (optional)' }
      },
      required: ['content', 'parentID']
    }
  },
  {
    name: 'update_block',
    description: 'Replace the content of an existing block.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Block ID to update' },
        content: { type: 'string', description: 'New markdown content' }
      },
      required: ['id', 'content']
    }
  },
  {
    name: 'batch_block_ops',
    description:
      'Execute multiple block operations in one call. ' +
      'Each operation: action "insert", "update", or "delete".',
    inputSchema: {
      type: 'object',
      properties: {
        operations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['insert', 'update', 'delete'], description: 'Operation type' },
              id: { type: 'string', description: 'Block ID (required for update/delete)' },
              content: { type: 'string', description: 'Markdown content (required for insert/update)' },
              parentID: { type: 'string', description: 'Parent block ID (required for insert)' },
              previousID: { type: 'string', description: 'Insert after this sibling (optional, for insert)' }
            },
            required: ['action']
          },
          description: 'Array of block operations to execute sequentially'
        }
      },
      required: ['operations']
    }
  },

  // ======================== ATTRIBUTE VIEW (DATABASE) ========================
  {
    name: 'create_database',
    description:
      'Create a new Attribute View database. This creates a dedicated page containing the DB. ' +
      'Use parentDocId to nest it under an existing document (e.g. pass the ID from create_document). ' +
      'Without parentDocId, the DB page is created at notebook root. ' +
      'Do NOT include "block" in fields — the primary Name field is auto-created.',
    inputSchema: {
      type: 'object',
      properties: {
        notebookId: { type: 'string', description: 'Notebook ID' },
        name: { type: 'string', description: 'Database name (also the page title)' },
        parentDocId: { type: 'string', description: 'Parent document ID — creates DB page as child of this doc (optional, defaults to notebook root)' },
        fields: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Field name' },
              type: {
                type: 'string',
                enum: ['text', 'number', 'select', 'mSelect', 'date', 'checkbox', 'url', 'email', 'phone', 'mAsset'],
                description: 'Field type'
              }
            },
            required: ['name', 'type']
          },
          description: 'Additional fields (optional). Primary "Name" field is always auto-created.'
        }
      },
      required: ['notebookId', 'name']
    }
  },
  {
    name: 'write_db_rows',
    description:
      'Create one or more entries (rows) in a database. ' +
      'Each row can have a name and initial field values.',
    inputSchema: {
      type: 'object',
      properties: {
        avId: { type: 'string', description: 'Database ID (Attribute View block ID)' },
        rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Entry name (primary field value)' },
              values: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    fieldId: { type: 'string', description: 'Field ID (from read_database)' },
                    type: {
                      type: 'string',
                      enum: ['text', 'number', 'checkbox', 'select', 'mSelect', 'date', 'url', 'email', 'phone', 'mAsset'],
                      description: 'Field type'
                    },
                    content: {
                      description: 'Value: string for text/select/url/email/phone, number for number/date(ms), boolean for checkbox, string[] for mSelect'
                    }
                  },
                  required: ['fieldId', 'type', 'content']
                }
              }
            }
          },
          description: 'Rows to create (1 or more)'
        }
      },
      required: ['avId', 'rows']
    }
  },
  {
    name: 'update_db_cells',
    description:
      'Update field values in one or more database entries. ' +
      'Each update targets an entry and specifies which cells to change.',
    inputSchema: {
      type: 'object',
      properties: {
        avId: { type: 'string', description: 'Database ID' },
        updates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              entryId: { type: 'string', description: 'Entry ID to update' },
              changes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    fieldId: { type: 'string', description: 'Field ID' },
                    type: {
                      type: 'string',
                      enum: ['text', 'number', 'checkbox', 'select', 'mSelect', 'date', 'url', 'email', 'phone', 'mAsset'],
                      description: 'Field type'
                    },
                    content: { description: 'New value' }
                  },
                  required: ['fieldId', 'type', 'content']
                }
              }
            },
            required: ['entryId', 'changes']
          }
        }
      },
      required: ['avId', 'updates']
    }
  },
  {
    name: 'delete_db_rows',
    description: 'Delete one or more entries from a database.',
    inputSchema: {
      type: 'object',
      properties: {
        avId: { type: 'string', description: 'Database ID' },
        entryIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Entry IDs to delete'
        }
      },
      required: ['avId', 'entryIds']
    }
  },
  {
    name: 'manage_db_fields',
    description:
      'Add or remove fields (columns) in a database. ' +
      'Renaming is not supported by SiYuan API — use the GUI.',
    inputSchema: {
      type: 'object',
      properties: {
        avId: { type: 'string', description: 'Database ID' },
        action: {
          type: 'string',
          enum: ['add', 'remove'],
          description: '"add" to create a field, "remove" to delete one'
        },
        name: { type: 'string', description: 'Field name (required for add)' },
        type: {
          type: 'string',
          enum: ['text', 'number', 'select', 'mSelect', 'date', 'checkbox', 'url', 'email', 'phone', 'mAsset'],
          description: 'Field type (required for add)'
        },
        fieldId: { type: 'string', description: 'Field ID to remove (required for remove)' }
      },
      required: ['avId', 'action']
    }
  },

  // ======================== MISC ========================
  {
    name: 'set_block_attrs',
    description: 'Set custom attributes (key-value metadata) on any block. Also used for tags.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Block ID' },
        attrs: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Key-value pairs to set. Example: {"custom-status": "reviewed", "custom-priority": "high"}'
        }
      },
      required: ['id', 'attrs']
    }
  },
  {
    name: 'upload_asset',
    description: 'Upload a file as a SiYuan asset. Provide base64-encoded file content.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Filename with extension (e.g. "image.png")' },
        data: { type: 'string', description: 'Base64-encoded file content' },
        assetsDirPath: { type: 'string', description: 'Target directory in assets/ (optional)' }
      },
      required: ['name', 'data']
    }
  }
];
