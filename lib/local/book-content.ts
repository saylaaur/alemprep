import acceleratedMotion from '../../scripts/data/books/accelerated-motion.json';
import arithmeticProgression from '../../scripts/data/books/arithmetic-progression.json';
import arithmeticRoots from '../../scripts/data/books/arithmetic-roots.json';
import baseArithmetic from '../../scripts/data/books/base-arithmetic.json';
import circularMotion from '../../scripts/data/books/circular-motion.json';
import energyConservation from '../../scripts/data/books/energy-conservation.json';
import factoring from '../../scripts/data/books/factoring.json';
import forcesInMechanics from '../../scripts/data/books/forces-in-mechanics.json';
import fractionsAndNumeric from '../../scripts/data/books/fractions-and-numeric.json';
import freeFallProjectile from '../../scripts/data/books/free-fall-projectile.json';
import geometricProgression from '../../scripts/data/books/geometric-progression.json';
import gravitation from '../../scripts/data/books/gravitation.json';
import informationMeasurement from '../../scripts/data/books/information-measurement.json';
import integerPowers from '../../scripts/data/books/integer-powers.json';
import kinematicsBasics from '../../scripts/data/books/kinematics-basics.json';
import linearEquations from '../../scripts/data/books/linear-equations.json';
import logarithmProperties from '../../scripts/data/books/logarithm-properties.json';
import logicOperations from '../../scripts/data/books/logic-operations.json';
import momentum from '../../scripts/data/books/momentum.json';
import newtonLaws from '../../scripts/data/books/newton-laws.json';
import positionalSystems from '../../scripts/data/books/positional-systems.json';
import pressurePascal from '../../scripts/data/books/pressure-pascal.json';
import pythonBasics from '../../scripts/data/books/python-basics.json';
import pythonBranching from '../../scripts/data/books/python-branching.json';
import pythonLoops from '../../scripts/data/books/python-loops.json';
import quadraticEquations from '../../scripts/data/books/quadratic-equations.json';
import rationalPowers from '../../scripts/data/books/rational-powers.json';
import shortMultiplication from '../../scripts/data/books/short-multiplication.json';
import textEncoding from '../../scripts/data/books/text-encoding.json';
import uniformMotion from '../../scripts/data/books/uniform-motion.json';
import vieta from '../../scripts/data/books/vieta.json';
import workPower from '../../scripts/data/books/work-power.json';

/**
 * Написанные конспекты для локального режима (в базе они лежат в books.content_ru/kk).
 * Файл генерирует content-studio/books/build.py — не править руками.
 */
export type RawBookContent = { ru?: unknown; kk?: unknown };

const REGISTRY: Record<string, RawBookContent> = {
  'accelerated-motion': acceleratedMotion,
  'arithmetic-progression': arithmeticProgression,
  'arithmetic-roots': arithmeticRoots,
  'base-arithmetic': baseArithmetic,
  'circular-motion': circularMotion,
  'energy-conservation': energyConservation,
  'factoring': factoring,
  'forces-in-mechanics': forcesInMechanics,
  'fractions-and-numeric': fractionsAndNumeric,
  'free-fall-projectile': freeFallProjectile,
  'geometric-progression': geometricProgression,
  'gravitation': gravitation,
  'information-measurement': informationMeasurement,
  'integer-powers': integerPowers,
  'kinematics-basics': kinematicsBasics,
  'linear-equations': linearEquations,
  'logarithm-properties': logarithmProperties,
  'logic-operations': logicOperations,
  'momentum': momentum,
  'newton-laws': newtonLaws,
  'positional-systems': positionalSystems,
  'pressure-pascal': pressurePascal,
  'python-basics': pythonBasics,
  'python-branching': pythonBranching,
  'python-loops': pythonLoops,
  'quadratic-equations': quadraticEquations,
  'rational-powers': rationalPowers,
  'short-multiplication': shortMultiplication,
  'text-encoding': textEncoding,
  'uniform-motion': uniformMotion,
  'vieta': vieta,
  'work-power': workPower,
};

export function bookContentOf(slug: string): RawBookContent | undefined {
  return Object.prototype.hasOwnProperty.call(REGISTRY, slug) ? REGISTRY[slug] : undefined;
}
