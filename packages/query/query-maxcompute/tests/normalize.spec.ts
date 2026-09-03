import { describe, it, expect } from 'vitest'
import { normalizeForMaxCompute } from '../src/normalize.ts'

describe('normalizeForMaxCompute', () => {
  describe('reasoning comment stripping', () => {
    it('strips English reasoning comments', () => {
      const sql = 'SELECT COUNT(*) FROM t\n-- Wait, DATEDIFF returns int not date\nWHERE ds = \'20240101\''
      expect(normalizeForMaxCompute(sql)).toBe('SELECT COUNT(*) FROM t\n\nWHERE ds = \'20240101\'')
    })

    it('strips Chinese reasoning comments', () => {
      const sql = 'SELECT * FROM t\n-- 思考一下这个表的结构\nWHERE a = 1'
      expect(normalizeForMaxCompute(sql)).toBe('SELECT * FROM t\n\nWHERE a = 1')
    })

    it('strips multiple reasoning comments', () => {
      const sql = '-- Actually let me reconsider\nSELECT 1\n-- Note this might fail\nFROM t'
      expect(normalizeForMaxCompute(sql)).toBe('SELECT 1\n\nFROM t')
    })

    it('preserves legitimate SQL comments', () => {
      const sql = 'SELECT * FROM t\n-- partition pruning hint\nWHERE ds = \'20240101\''
      expect(normalizeForMaxCompute(sql)).toBe(sql)
    })
  })

  describe('fenced code block stripping', () => {
    it('strips ```sql markers', () => {
      const sql = '```sql\nSELECT 1 FROM t\n```'
      expect(normalizeForMaxCompute(sql)).toBe('SELECT 1 FROM t')
    })

    it('strips bare ``` markers', () => {
      const sql = '```\nSELECT 1\n```'
      expect(normalizeForMaxCompute(sql)).toBe('SELECT 1')
    })
  })

  describe('function rewrites', () => {
    it('NOW() → GETDATE()', () => {
      expect(normalizeForMaxCompute('SELECT NOW() AS ts')).toBe('SELECT GETDATE() AS ts')
    })

    it('CURRENT_TIMESTAMP → GETDATE()', () => {
      expect(normalizeForMaxCompute('SELECT CURRENT_TIMESTAMP AS ts')).toBe('SELECT GETDATE() AS ts')
    })

    it('CURDATE() → TO_CHAR(GETDATE())', () => {
      expect(normalizeForMaxCompute('WHERE ds = CURDATE()')).toBe("WHERE ds = TO_CHAR(GETDATE(), 'yyyyMMdd')")
    })

    it('SQL Server DATEDIFF(day, d1, d2) → MaxCompute DATEDIFF(d1, d2, unit)', () => {
      const input = 'SELECT DATEDIFF(day, create_date, GETDATE()) AS age'
      const expected = "SELECT DATEDIFF(create_date, GETDATE(), 'dd') AS age"
      expect(normalizeForMaxCompute(input)).toBe(expected)
    })

    it('DATEDIFF with month unit', () => {
      const input = 'SELECT DATEDIFF(month, start_date, end_date)'
      const expected = "SELECT DATEDIFF(start_date, end_date, 'mm')"
      expect(normalizeForMaxCompute(input)).toBe(expected)
    })

    it('DATEDIFF with year unit', () => {
      const input = 'SELECT DATEDIFF(yy, d1, d2)'
      const expected = "SELECT DATEDIFF(d1, d2, 'yyyy')"
      expect(normalizeForMaxCompute(input)).toBe(expected)
    })

    it('preserves already-correct MaxCompute DATEDIFF(d1, d2, unit)', () => {
      const input = "SELECT DATEDIFF(d1, d2, 'dd') AS diff"
      expect(normalizeForMaxCompute(input)).toBe(input)
    })

    it('DATE_SUB → DATEADD with negative', () => {
      const input = 'WHERE ds >= DATE_SUB(GETDATE(), INTERVAL 7 DAY)'
      const expected = "WHERE ds >= DATEADD(GETDATE(), -7, 'dd')"
      expect(normalizeForMaxCompute(input)).toBe(expected)
    })

    it('DATE_ADD → DATEADD', () => {
      const input = 'SELECT DATE_ADD(create_date, INTERVAL 30 DAY)'
      const expected = "SELECT DATEADD(create_date, 30, 'dd')"
      expect(normalizeForMaxCompute(input)).toBe(expected)
    })

    it('ISNULL → NVL', () => {
      expect(normalizeForMaxCompute('SELECT ISNULL(x, 0)')).toBe('SELECT NVL(x, 0)')
    })

    it('IFNULL → NVL', () => {
      expect(normalizeForMaxCompute('SELECT IFNULL(name, "")')).toBe('SELECT NVL(name, "")')
    })

    it('STR_TO_DATE → TO_DATE with translated Java format', () => {
      expect(normalizeForMaxCompute("STR_TO_DATE(x, '%Y%m%d')")).toBe("TO_DATE(x, 'yyyyMMdd')")
    })

    it('STR_TO_DATE with a literal date arg translates too', () => {
      expect(normalizeForMaxCompute("STR_TO_DATE('2026-01-01', '%Y-%m-%d')")).toBe("TO_DATE('2026-01-01', 'yyyy-MM-dd')")
    })

    it('DATE_FORMAT → TO_CHAR with translated Java format', () => {
      expect(normalizeForMaxCompute("DATE_FORMAT(d, '%Y-%m-%d')")).toBe("TO_CHAR(d, 'yyyy-MM-dd')")
    })

    it('DATE_FORMAT with an unmappable specifier is left un-rewritten (clean error, no silent garble)', () => {
      // %M (month name) is locale-dependent in Java SimpleDateFormat — bail so
      // MaxCompute errors on DATE_FORMAT rather than emit silent wrong data.
      expect(normalizeForMaxCompute("DATE_FORMAT(d, '%M')")).toBe("DATE_FORMAT(d, '%M')")
    })
  })

  describe('TOP N → LIMIT N', () => {
    it('rewrites SELECT TOP N', () => {
      const input = 'SELECT TOP 10 * FROM t WHERE x = 1'
      const expected = 'SELECT * FROM t WHERE x = 1 LIMIT 10'
      expect(normalizeForMaxCompute(input)).toBe(expected)
    })

    it('does not double-add LIMIT if already present', () => {
      const input = 'SELECT TOP 10 * FROM t LIMIT 5'
      const expected = 'SELECT * FROM t LIMIT 5'
      expect(normalizeForMaxCompute(input)).toBe(expected)
    })

    it('preserves SQL without TOP', () => {
      const input = 'SELECT * FROM t LIMIT 10'
      expect(normalizeForMaxCompute(input)).toBe(input)
    })
  })

  describe('edge cases', () => {
    it('returns empty string unchanged', () => {
      expect(normalizeForMaxCompute('')).toBe('')
    })

    it('handles null/undefined gracefully', () => {
      expect(normalizeForMaxCompute(null as unknown as string)).toBe(null)
      expect(normalizeForMaxCompute(undefined as unknown as string)).toBe(undefined)
    })

    it('combined: reasoning + function rewrite + TOP N', () => {
      const input = [
        '```sql',
        '-- Wait, let me use the right table',
        'SELECT TOP 5 DATEDIFF(day, create_date, NOW()) AS age',
        'FROM dws_10000251_acc_summary_df',
        'WHERE ds = CURDATE()',
        '```',
      ].join('\n')
      const expected = [
        "SELECT DATEDIFF(create_date, GETDATE(), 'dd') AS age",
        'FROM dws_10000251_acc_summary_df',
        "WHERE ds = TO_CHAR(GETDATE(), 'yyyyMMdd') LIMIT 5",
      ].join('\n')
      expect(normalizeForMaxCompute(input)).toBe(expected)
    })
  })
})
