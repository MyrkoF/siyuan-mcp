import { describe, expect, it } from 'vitest';
import { AttributeViewService } from './av-service';

describe('AttributeViewService', () => {
  it('buildUpdateValue encodes relation writes with blockIDs', () => {
    const service = new AttributeViewService({} as any);
    const result = (service as any).buildUpdateValue({
      fieldId: 'repo',
      type: 'relation',
      content: ['row-b', 'row-c']
    });

    expect(result).toEqual({
      relation: {
        blockIDs: ['row-b', 'row-c']
      }
    });
  });

  it('maps supported rollup calc names to SiYuan operators', () => {
    const service = new AttributeViewService({} as any);

    expect((service as any).mapRollupCalcOperator('count')).toBe('CountAll');
    expect((service as any).mapRollupCalcOperator('countDistinct')).toBe('CountUniqueValues');
    expect((service as any).mapRollupCalcOperator('sum')).toBe('Sum');
    expect((service as any).mapRollupCalcOperator('avg')).toBe('Average');
    expect((service as any).mapRollupCalcOperator('empty')).toBe('CountEmpty');
    expect((service as any).mapRollupCalcOperator('notEmpty')).toBe('CountNotEmpty');
    expect((service as any).mapRollupCalcOperator('unique')).toBe('UniqueValues');
    expect((service as any).mapRollupCalcOperator('checked')).toBe('Checked');
    expect((service as any).mapRollupCalcOperator('unchecked')).toBe('Unchecked');
    expect((service as any).mapRollupCalcOperator('percent')).toBe('PercentNotEmpty');
    expect((service as any).mapRollupCalcOperator(undefined)).toBe('None');
  });
});
