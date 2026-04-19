#!/usr/bin/env node

const { createSiyuanClient } = require('../dist/siyuanClient');
const { AttributeViewService } = require('../dist/services/av-service');

async function main() {
  const token = process.env.SIYUAN_API_TOKEN || process.env.SIYUAN_TOKEN;
  if (!token) {
    throw new Error('Set SIYUAN_API_TOKEN before running the smoke test');
  }

  const client = createSiyuanClient({ autoDiscoverPort: true, token });
  const avService = new AttributeViewService(client);
  const stamp = `MCP Smoke ${Date.now()}`;

  const notebookResp = await client.request('/api/notebook/createNotebook', { name: stamp });
  if (!notebookResp || notebookResp.code !== 0) {
    throw new Error(`createNotebook failed: ${notebookResp?.msg ?? 'unknown error'}`);
  }

  const notebookId = notebookResp.data.notebook.id;

  try {
    const tasksDb = await avService.createDatabase(notebookId, `${stamp} Tasks`, [
      { name: 'Status', type: 'select' },
      { name: 'Estimate', type: 'number' }
    ]);
    const reposDb = await avService.createDatabase(notebookId, `${stamp} Repos`, []);

    const tasksInitial = await avService.renderDatabase(tasksDb.avId);
    const estimateField = tasksInitial.fields.find(field => field.name === 'Estimate');
    const statusField = tasksInitial.fields.find(field => field.name === 'Status');
    const nameField = tasksInitial.fields.find(field => field.name === 'Name');
    if (!estimateField || !statusField || !nameField) {
      throw new Error('Required initial fields were not found');
    }

    const relationField = await avService.createRelationField(tasksDb.avId, 'Repo Link', {
      targetAvId: reposDb.avId,
      backRef: true,
      backRefName: 'Tasks'
    });

    const reposAfterRelation = await avService.renderDatabase(reposDb.avId);
    const repoBackRef = reposAfterRelation.fields.find(field => field.name === 'Tasks');
    if (!repoBackRef) {
      throw new Error('Back-reference relation field was not created');
    }

    await avService.createRollupField(reposDb.avId, 'Task Count', {
      relationFieldId: repoBackRef.id,
      targetFieldId: nameField.id,
      calc: 'count'
    });

    const repoRow = await avService.bulkCreateEntries(reposDb.avId, [{ name: 'repo-a' }]);
    const taskRow = await avService.bulkCreateEntries(tasksDb.avId, [{
      name: 'task-a',
      values: [
        { fieldId: estimateField.id, type: 'number', content: 5 },
        { fieldId: statusField.id, type: 'select', content: 'Todo' }
      ]
    }]);

    await avService.bulkUpdateEntries(tasksDb.avId, [{
      entryId: taskRow[0].id,
      changes: [{ fieldId: relationField.id, type: 'relation', content: [repoRow[0].id] }]
    }]);

    const taskRead = await avService.getEntry(tasksDb.avId, taskRow[0].id);
    if (taskRead.cells['Repo Link']?.ids?.[0] !== repoRow[0].id) {
      throw new Error('Relation write did not round-trip');
    }

    const repoRead = await avService.getEntry(reposDb.avId, repoRow[0].id);
    if (!Array.isArray(repoRead.cells['Task Count']) || repoRead.cells['Task Count'][0]?.block?.content !== 'task-a') {
      throw new Error('Rollup readback did not return the related task row');
    }

    const addedView = await avService.addView(tasksDb.avId, {
      type: 'kanban',
      name: 'By Repo',
      groupByFieldId: relationField.id
    });
    await avService.updateView(tasksDb.avId, addedView.id, {
      name: 'By Repo Updated',
      sorts: [{ column: estimateField.id, order: 1 }]
    });

    const view = (await avService.listViews(tasksDb.avId)).find(item => item.id === addedView.id);
    if (!view || view.name !== 'By Repo Updated') {
      throw new Error('View update did not persist');
    }

    const selectOptions = await avService.setSelectOptions(tasksDb.avId, statusField.id, [
      { name: 'Todo', color: '1', desc: 'Todo work' },
      { name: 'Doing', color: '2', desc: 'In progress' }
    ]);
    if (selectOptions.length !== 2) {
      throw new Error('Select option update did not persist');
    }

    const bindDocResp = await client.request('/api/filetree/createDocWithMd', {
      notebook: notebookId,
      path: `/${stamp}-bind-doc`,
      markdown: '# Bound Row'
    });
    const detachedRows = await avService.bulkCreateEntries(tasksDb.avId, [{ name: 'detached-row' }]);
    const boundRow = await avService.bindRowToDoc(tasksDb.avId, detachedRows[0].id, bindDocResp.data);
    if (boundRow.cells.Name.id !== bindDocResp.data || boundRow.cells.Name.isDetached !== false) {
      throw new Error('bind_row_to_doc did not persist');
    }

    const docBackedRow = await avService.createDocBackedRow(
      tasksDb.avId,
      notebookId,
      `/${stamp}-doc-backed-row`,
      'Doc Backed Row',
      '# Body',
      [{ fieldId: estimateField.id, type: 'number', content: 8 }]
    );
    if (docBackedRow.cells.Name.isDetached !== false || docBackedRow.cells.Estimate !== 8) {
      throw new Error('create_doc_backed_row did not persist');
    }

    const renameResp = await client.request('/api/notebook/renameNotebook', {
      notebook: notebookId,
      name: `${stamp} Renamed`
    });
    if (!renameResp || renameResp.code !== 0) {
      throw new Error(`renameNotebook failed: ${renameResp?.msg ?? 'unknown error'}`);
    }

    console.log(JSON.stringify({ ok: true, notebookId, tasksDb, reposDb }, null, 2));
  } finally {
    await client.request('/api/notebook/removeNotebook', { notebook: notebookId }).catch(() => {});
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
