import { describe, expect, it } from 'vitest';
import { checkImport, IMPORT_TEMPLATES, parseCsv } from './csv';
import { productSchema, settingsPatchSchema, settingsSchema } from './schemas';

describe('CSV parser', () => {
  it('handles quotes, escaped quotes, CRLF, a BOM and blank lines', () => {
    const text = '﻿a,b,c\r\n1,"x, y","say ""hi"""\r\n\r\n2,,"multi\nline"\n';
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x, y', 'say "hi"'],
      ['2', '', 'multi\nline'],
    ]);
  });

  it('detects the semicolon separator Norwegian Excel writes', () => {
    expect(parseCsv('sku;name_nb\nA-1;"Sokk; ull"\n')).toEqual([
      ['sku', 'name_nb'],
      ['A-1', 'Sokk; ull'],
    ]);
  });
});

describe('import checks', () => {
  it('accepts every template', () => {
    for (const kind of ['products', 'orders', 'returns'] as const) {
      const r = checkImport(kind, IMPORT_TEMPLATES[kind]);
      expect(r.issues, kind).toEqual([]);
      expect(r.plan?.kind).toBe(kind);
    }
  });

  it('groups order lines into orders and keeps line numbers', () => {
    const r = checkImport('orders', 'order,customer_ref,sku,qty,price_nok\n3001,K 1,HD-NAVY-M,1,599\n3002,K 2,SK-WOOL-40,2,\n3001,K 1,CP-BEANIE,1,199\n');
    expect(r.plan).toEqual({
      kind: 'orders',
      orders: [
        { line: 2, ext_id: '3001', customer_ref: 'K 1', lines: [{ line: 2, sku: 'HD-NAVY-M', qty: 1, price_nok: 599 }, { line: 4, sku: 'CP-BEANIE', qty: 1, price_nok: 199 }] },
        { line: 3, ext_id: '3002', customer_ref: 'K 2', lines: [{ line: 3, sku: 'SK-WOOL-40', qty: 2, price_nok: undefined }] },
      ],
    });
  });

  it('reports problems by line and column, and writes nothing', () => {
    const r = checkImport('products', 'sku,name_nb,name_en,category,color,price_nok,location_code\nok-lower,Navn,Name,apparel,red,10,A-1\nGOOD-1,Navn,Name,shoes,red,-5,A-1\nGOOD-1,Navn,Name,apparel,red,5,A-1\n');
    expect(r.plan).toBeNull();
    expect(r.issues).toContainEqual({ line: 2, column: 'sku', code: 'sku_format' });
    expect(r.issues.filter((i) => i.line === 3).map((i) => i.column).sort()).toEqual(['category', 'price_nok']);
  });

  it('refuses missing and unknown columns, conflicting rows, and empty files', () => {
    expect(checkImport('orders', 'order,sku\n1,A\n').issues).toContainEqual({ line: 1, column: 'customer_ref', code: 'missing_column' });
    expect(checkImport('products', `${IMPORT_TEMPLATES.products.split('\n')[0]},secret\n`).issues).toContainEqual({ line: 1, column: 'secret', code: 'unknown_column' });
    expect(checkImport('orders', 'order,customer_ref,sku,qty\n1,A,HD-NAVY-M,1\n1,B,SK-WOOL-40,1\n').issues).toContainEqual({ line: 3, column: 'customer_ref', code: 'customer_differs' });
    expect(checkImport('returns', 'return,order,customer_reason_nb,sku\n9,1,X,HD-NAVY-M\n9,2,X,SK-WOOL-40\n').issues).toContainEqual({ line: 3, column: 'order', code: 'order_differs' });
    expect(checkImport('products', '').issues).toEqual([{ line: 1, code: 'empty_file' }]);
  });

  it('a duplicate SKU in a product file is an error, not a silent overwrite', () => {
    const r = checkImport('products', `${IMPORT_TEMPLATES.products}${IMPORT_TEMPLATES.products.split('\n')[1]}\n`);
    expect(r.issues).toContainEqual({ line: 3, column: 'sku', code: 'duplicate_in_file' });
  });
});

describe('admin settings', () => {
  it('keeps values inside the ranges that keep the engine sane', () => {
    expect(settingsPatchSchema.safeParse({ pack_confidence_min: 0.3 }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ confusion_threshold: 1 }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ photo_retention_days: 0 }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ max_retakes: 2.5 }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({}).success).toBe(false);
    expect(settingsPatchSchema.parse({ photo_retention_days: 14, unknown_key: 1 })).toEqual({ photo_retention_days: 14 });
  });

  it('Norwegian stays enabled and languages keep their canonical order', () => {
    expect(settingsSchema.shape.enabled_languages.safeParse(['en', 'pl']).success).toBe(false);
    expect(settingsSchema.shape.enabled_languages.parse(['uk', 'nb', 'pl'])).toEqual(['nb', 'pl', 'uk']);
  });

  it('validates products (SKU format, barcode digits, empty optional fields become null)', () => {
    const base = { sku: 'TS-WHITE-XL', name_nb: 'T-skjorte', name_en: 'T-shirt', category: 'apparel', color: 'white', price_nok: 199, location_code: 'E-18-2' };
    expect(productSchema.parse({ ...base, size: '', variant_group: '', barcode: '' })).toMatchObject({ size: null, variant_group: null, barcode: null });
    expect(productSchema.safeParse({ ...base, barcode: '12ab' }).success).toBe(false);
    expect(productSchema.safeParse({ ...base, sku: 'lower' }).success).toBe(false);
  });
});
