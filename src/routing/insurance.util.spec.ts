import { isInsured, normalizeMetaContent } from '@/routing/insurance.util';
import { PackageBody } from '@dto/package.dto';

const buildPackage = (overrides?: Partial<PackageBody>): PackageBody => ({
  id: 'pkg-1',
  deliveryStrategy: 'direct',
  maxHops: 3,
  createdAt: '2026-07-02T00:00:00.000Z',
  deliverNotBefore: null,
  originId: 'TK3',
  destinationId: 'HGW',
  metaContent: null,
  isMetaEncrypted: false,
  constraints: { criteria: 'price' },
  priorityClass: 'medium',
  payment: 10000,
  ...overrides,
});

// RF02 (E3) — detección del flag insured en las formas que llegan en la práctica.
describe('isInsured', () => {
  it('true con metaContent objeto {insured: true} (formato enunciado)', () => {
    expect(isInsured(buildPackage({ metaContent: { insured: true } }))).toBe(
      true,
    );
  });

  it('true con metaContent string JSON (round-trip BD u otros grupos)', () => {
    expect(isInsured(buildPackage({ metaContent: '{"insured": true}' }))).toBe(
      true,
    );
  });

  it('true con constraints.insured (retro-compat mensajes propios)', () => {
    expect(
      isInsured(
        buildPackage({ constraints: { criteria: 'price', insured: true } }),
      ),
    ).toBe(true);
  });

  it('false cuando no hay flag o es falsy', () => {
    expect(isInsured(buildPackage())).toBe(false);
    expect(isInsured(buildPackage({ metaContent: 'una nota' }))).toBe(false);
    expect(isInsured(buildPackage({ metaContent: { insured: false } }))).toBe(
      false,
    );
    expect(isInsured(buildPackage({ metaContent: '{"insured": "yes"}' }))).toBe(
      false,
    );
  });
});

describe('normalizeMetaContent', () => {
  it('convierte string JSON de objeto a objeto', () => {
    expect(normalizeMetaContent('{"insured": true}')).toEqual({
      insured: true,
    });
  });

  it('conserva texto plano, null y objetos tal cual', () => {
    expect(normalizeMetaContent('una nota')).toBe('una nota');
    expect(normalizeMetaContent(null)).toBeNull();
    expect(normalizeMetaContent({ insured: true })).toEqual({ insured: true });
  });

  it('conserva strings que parecen JSON pero no lo son', () => {
    expect(normalizeMetaContent('{no-json')).toBe('{no-json');
  });
});
