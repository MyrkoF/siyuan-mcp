import { describe, expect, it } from 'vitest';
import { parseCellValue, parseColumns } from './avParser';

describe('avParser', () => {
  it('parses relation cell values', () => {
    const result = parseCellValue({
      value: {
        type: 'relation',
        relation: {
          blockIDs: ['row-b'],
          contents: [{ block: { content: 'Target Row' } }]
        }
      }
    });

    expect(result).toEqual({
      ids: ['row-b'],
      contents: [{ block: { content: 'Target Row' } }]
    });
  });

  it('preserves field metadata for options, relation, and rollup', () => {
    const columns = parseColumns([
      {
        id: 'status',
        name: 'Status',
        type: 'select',
        options: [{ name: 'Todo', color: '1' }]
      },
      {
        id: 'repo',
        name: 'Repo',
        type: 'relation',
        relation: { avID: 'repos-db', isTwoWay: true, backKeyID: 'tasks' }
      },
      {
        id: 'repo_count',
        name: 'Repo Count',
        type: 'rollup',
        rollup: { relationKeyID: 'repo', keyID: 'name', calc: { operator: 'CountAll' } }
      }
    ]);

    expect(columns).toEqual([
      {
        id: 'status',
        name: 'Status',
        type: 'select',
        options: [{ name: 'Todo', color: '1' }],
        relation: undefined,
        rollup: undefined
      },
      {
        id: 'repo',
        name: 'Repo',
        type: 'relation',
        options: undefined,
        relation: { avID: 'repos-db', isTwoWay: true, backKeyID: 'tasks' },
        rollup: undefined
      },
      {
        id: 'repo_count',
        name: 'Repo Count',
        type: 'rollup',
        options: undefined,
        relation: undefined,
        rollup: { relationKeyID: 'repo', keyID: 'name', calc: { operator: 'CountAll' } }
      }
    ]);
  });
});
