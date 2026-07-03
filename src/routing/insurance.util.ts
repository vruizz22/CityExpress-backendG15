import { PackageBody } from '@dto/package.dto';

/**
 * RF02 (E3) — helpers puros del flag `insured`.
 *
 * El enunciado define `metaContent: { "insured": true }` como objeto, pero en
 * la práctica llega también como string JSON (round-trip por la columna
 * `String?` de PackageEvent o emisores de otros grupos) y nuestros mensajes
 * E2/E3 previos llevan el flag en `constraints.insured`.
 */

/**
 * Si `metaContent` es un string JSON de objeto, devuelve el objeto (evita
 * degradar el formato al reenviar pendientes rehidratados desde BD). Cualquier
 * otro valor (texto plano, null, objeto) se conserva tal cual.
 */
export function normalizeMetaContent(
  value: PackageBody['metaContent'],
): PackageBody['metaContent'] {
  if (typeof value !== 'string' || !value.trimStart().startsWith('{')) {
    return value;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Texto plano que parece JSON pero no lo es: se conserva tal cual.
  }
  return value;
}

/** True si el paquete viaja asegurado (metaContent objeto/string-JSON o constraints). */
export function isInsured(pkg: PackageBody): boolean {
  const meta = normalizeMetaContent(pkg.metaContent);
  if (meta && typeof meta === 'object' && meta.insured === true) {
    return true;
  }
  // Retro-compat: flujos internos ya mergeados llevan insured en constraints.
  const constraints = pkg.constraints;
  return constraints?.insured === true;
}
