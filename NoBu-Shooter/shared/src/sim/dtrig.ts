/**
 * dtrig.ts — deterministic sine and cosine (docs/PHASE6_PLAN.md §8 X1).
 *
 * `Math.sin` / `Math.cos` are not required to be correctly rounded, and in
 * practice Chrome and Node (both V8, different versions / build flags) differ
 * in the last bit for ≈ 3 % of the circle mover's angles. Lockstep compares
 * worlds bit for bit, so anything both sides compute must use operations
 * IEEE 754 defines exactly: + − × ÷, Math.sqrt and Math.round. JavaScript
 * never fuses a multiply-add, so the same expression gives the same bits on
 * every engine.
 *
 * Range reduction: Cody-Waite with π/2 split in two parts (accurate for the
 * angles used here, |x| < 2^20). Kernels: the fdlibm polynomials on
 * [−π/4, π/4] (error ≈ 1 ulp, plenty for drawing).
 */

const INV_PIO2 = 6.36619772367581382433e-01;
const PIO2_1 = 1.57079632673412561417e+00; // first 33 bits of π/2
const PIO2_1T = 6.07710050650619224932e-11; // π/2 − PIO2_1

const S1 = -1.66666666666666324348e-01;
const S2 = 8.33333333332248946124e-03;
const S3 = -1.98412698298579493134e-04;
const S4 = 2.75573137070700676789e-06;
const S5 = -2.50507602534068634195e-08;
const S6 = 1.58969099521155010221e-10;

const C1 = 4.16666666666666019037e-02;
const C2 = -1.38888888888741095749e-03;
const C3 = 2.48015872894767294178e-05;
const C4 = -2.75573143513906633035e-07;
const C5 = 2.08757232129817482790e-09;
const C6 = -1.13596475577881948265e-11;

function kSin(x: number): number {
  const z = x * x;
  return x + x * z * (S1 + z * (S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)))));
}

function kCos(x: number): number {
  const z = x * x;
  return 1 - 0.5 * z + z * z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
}

/** x = n·π/2 + r with r in [−π/4, π/4]; returns [n mod 4, r]. */
function reduce(x: number): [number, number] {
  const n = Math.round(x * INV_PIO2);
  const r = (x - n * PIO2_1) - n * PIO2_1T;
  return [((n % 4) + 4) % 4, r];
}

/** Sine with the same bits on every JavaScript engine. */
export function dsin(x: number): number {
  const [q, r] = reduce(x);
  switch (q) {
    case 0: return kSin(r);
    case 1: return kCos(r);
    case 2: return -kSin(r);
    default: return -kCos(r);
  }
}

/** Cosine with the same bits on every JavaScript engine. */
export function dcos(x: number): number {
  const [q, r] = reduce(x);
  switch (q) {
    case 0: return kCos(r);
    case 1: return -kSin(r);
    case 2: return -kCos(r);
    default: return kSin(r);
  }
}
