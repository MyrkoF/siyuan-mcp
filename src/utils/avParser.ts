/**
 * Attribute View — utilitaires de parsing
 *
 * Règles CLAUDE.md :
 * - parseCellValue() basé sur cell.value.type (jamais par index)
 * - findColumn() par nom ou ID, jamais par index
 * - Toujours vérifier isDetached avant de créer un lien doc
 */

/**
 * Extrait la valeur lisible d'une cellule SiYuan AV.
 * Identifie le type via cell.value.type (champ canonique).
 */
export function parseCellValue(cell: any): any {
  if (!cell?.value) return null;
  const v = cell.value;

  switch (v.type) {
    case 'block':
      return {
        content: v.block?.content ?? '',
        id: v.block?.id ?? null,
        isDetached: v.isDetached ?? false
      };

    case 'checkbox':
      return v.checkbox?.checked ?? false;

    case 'mSelect':
    case 'select':
      return (v.mSelect ?? (v.select ? [v.select] : [])).map(
        (s: any) => s?.content ?? s
      );

    case 'text':
      return v.text?.content ?? '';

    case 'number':
      return v.number?.content ?? null;

    case 'relation':
      return {
        ids: v.relation?.blockIDs ?? [],
        contents: v.relation?.contents ?? []
      };

    case 'date':
      return v.date?.content ?? null;

    case 'url':
    case 'email':
    case 'phone':
      return v[v.type]?.content ?? '';

    case 'created':
    case 'updated':
      return v[v.type]?.content ?? null;

    case 'rollup': {
      const contents = v.rollup?.contents ?? [];
      if (contents.length === 1 && contents[0]?.type === 'number') {
        return contents[0]?.number?.content ?? null;
      }
      return contents;
    }

    case 'template':
      // Template column: computed read-only string
      return v.template?.content ?? '';

    case 'mAsset':
      // Assets column: array of {type, name, content (file path)}
      return (v.mAsset ?? []).map((a: any) => ({
        type: a.type ?? 'file',
        name: a.name ?? '',
        content: a.content ?? ''
      }));

    case 'lineNumber':
      // Auto-generated row number — no writable sub-field, value computed by position
      return v.createdAt ?? null;

    default:
      // Fallback défensif : tenter d'extraire par clé connue
      if (v.text !== undefined)    return v.text?.content ?? '';
      if (v.number !== undefined)  return v.number?.content ?? null;
      if (v.mSelect !== undefined) return v.mSelect.map((s: any) => s?.content ?? s);
      if (v.select !== undefined)  return [v.select?.content ?? v.select];
      if (v.checkbox !== undefined) return v.checkbox?.checked ?? false;
      if (v.date !== undefined)    return v.date?.content ?? null;
      if (v.url !== undefined)     return v.url?.content ?? '';
      if (v.email !== undefined)   return v.email?.content ?? '';
      if (v.phone !== undefined)   return v.phone?.content ?? '';
      if (v.mAsset !== undefined)  return (v.mAsset ?? []).map((a: any) => ({ type: a.type ?? 'file', name: a.name ?? '', content: a.content ?? '' }));
      if (v.relation !== undefined) return {
        ids: v.relation?.blockIDs ?? [],
        contents: v.relation?.contents ?? []
      };
      if (v.block !== undefined) return {
        content: v.block?.content ?? '',
        id: v.block?.id ?? null,
        isDetached: v.isDetached ?? false
      };
      return null;
  }
}

/**
 * Trouve une colonne par nom ou ID. Jamais par index.
 */
export function findColumn(
  columns: Array<{ id: string; name: string; [key: string]: any }>,
  nameOrId: string
): { id: string; name: string; [key: string]: any } | undefined {
  return columns.find(
    col => col.name === nameOrId || col.id === nameOrId
  );
}

/**
 * Convertit une liste brute de colonnes SiYuan en format normalisé.
 */
export function parseColumns(rawColumns: any[]): Array<{ id: string; name: string; type: string; options?: any[]; relation?: any; rollup?: any }> {
  return (rawColumns ?? [])
    .filter((col: any) => col?.id)
    .map((col: any) => ({
      id: col.id,
      name: col.name ?? col.id,
      type: col.type ?? 'text',
      options: col.options ?? undefined,
      relation: col.relation ?? undefined,
      rollup: col.rollup ?? undefined
    }));
}

/**
 * Parse une ligne brute SiYuan en objet { id, cells }.
 * cells est indexé à la fois par colonne ID et par colonne name.
 */
export function parseRow(
  row: any,
  columns: Array<{ id: string; name: string; type: string; options?: any[]; relation?: any; rollup?: any }>
): { id: string; cells: Record<string, any> } {
  const cells: Record<string, any> = {};
  const rawCells: any[] = row.cells ?? [];

  for (const cell of rawCells) {
    // L'ID de colonne est dans cell.value.keyID (canonique) ou cell.columnID
    const colId: string = cell.value?.keyID ?? cell.columnID ?? cell.id ?? '';
    if (!colId) continue;

    const parsed = parseCellValue(cell);
    cells[colId] = parsed;

    // Alias par nom de colonne
    const col = columns.find(c => c.id === colId);
    if (col && col.name && col.name !== colId) {
      cells[col.name] = parsed;
    }
  }

  return { id: row.id, cells };
}
