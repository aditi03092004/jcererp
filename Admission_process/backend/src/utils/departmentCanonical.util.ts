import Department from '../models/Department';

/**
 * UUID v4 format verification.
 */
export const isUuidString = (val: string | null | undefined): boolean => {
  if (!val || typeof val !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());
};

/**
 * Returns canonical branch code equivalents for queries where sections or students
 * may be stored under either canonical department code or legacy branch alias.
 * 
 * CRITICAL RULE:
 * CSE and CSE-AIML must NEVER overlap.
 * - 'CSE' returns ONLY ['CSE']
 * - 'CSE-AIML' returns ['CSE-AIML', 'AIML']
 * - 'AIML' returns ['CSE-AIML', 'AIML']
 */
export const getBranchEquivalents = (branchCode: string | null | undefined): string[] => {
  if (!branchCode || typeof branchCode !== 'string') return [];
  const clean = branchCode.trim().toUpperCase();
  if (
    clean === 'AIML' ||
    clean === 'CSE-AIML' ||
    clean === 'E2D70068-A247-4B6D-8AD2-C95D5DD4287F' ||
    clean === 'COMPUTER SCIENCE & ENGINEERING (AIML)'
  ) {
    return ['CSE-AIML', 'AIML'];
  }
  if (
    clean === 'CSE' ||
    clean === '9CB41A9D-E5B9-474C-A586-A86772EEC5B3' ||
    clean === 'COMPUTER SCIENCE & ENGINEERING'
  ) {
    return ['CSE'];
  }
  if (
    clean === 'ECE' ||
    clean === '5134929B-53D4-44A8-A881-3882BA1F5E93' ||
    clean === 'ELECTRONICS & COMMUNICATION ENGINEERING'
  ) {
    return ['ECE'];
  }
  if (
    clean === 'ME' ||
    clean === '3083BB23-656A-4285-A5C1-64FF455A45AA' ||
    clean === 'MECHANICAL ENGINEERING'
  ) {
    return ['ME'];
  }
  if (
    clean === 'CV' ||
    clean === 'CB064A49-A8AA-40B8-9942-0473780624AE' ||
    clean === 'CIVIL ENGINEERING'
  ) {
    return ['CV'];
  }
  if (
    clean === 'AS' ||
    clean === '337858C4-7AA8-4826-8118-D748A04DAF31' ||
    clean === 'APPLIED SCIENCE'
  ) {
    return ['AS'];
  }
  return [branchCode.trim()];
};

/**
 * Canonical in-memory department resolver from an array of Department models.
 * Prioritizes exact IDs, exact codes, and longer codes first to guarantee
 * CSE-AIML is NEVER accidentally matched as CSE.
 */
export const resolveDepartmentCanonical = (
  input: string | null | undefined,
  departments: Department[]
): Department | null => {
  if (!input || typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;
  const rawUpper = raw.toUpperCase();
  const rawLower = raw.toLowerCase();

  // 1. Direct ID match (by primary key ID or UUID)
  const byId = departments.find((d) => d.id === raw);
  if (byId) return byId;

  // 2. Direct exact Code match (case-insensitive)
  const byCode = departments.find((d) => d.code.toUpperCase() === rawUpper);
  if (byCode) return byCode;

  // 3. Known business alias: 'AIML' -> 'CSE-AIML'
  if (rawUpper === 'AIML') {
    const aimlDept = departments.find((d) => d.code.toUpperCase() === 'CSE-AIML');
    if (aimlDept) return aimlDept;
  }

  // 4. Direct exact Name match (case-insensitive)
  const byName = departments.find((d) => d.name.toLowerCase() === rawLower);
  if (byName) return byName;

  // 5. Code prefix matching with delimiter (e.g., "CSE-AIML — Computer Science & Engineering (AIML)")
  // Sort descending by code length so "CSE-AIML" is tested BEFORE "CSE"!
  const sortedByCodeLen = [...departments].sort((a, b) => b.code.length - a.code.length);
  for (const d of sortedByCodeLen) {
    const dCode = d.code.toUpperCase();
    const escaped = dCode.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    // Match if string starts with code followed by a separator (dash, em-dash, colon, space) or end-of-string
    const prefixRegex = new RegExp(`^${escaped}\\s*([—–:-]|\\s|$)`, 'i');
    if (prefixRegex.test(raw)) {
      return d;
    }
  }

  // 6. Name match with length-descending order
  const sortedByNameLen = [...departments].sort((a, b) => b.name.length - a.name.length);
  for (const d of sortedByNameLen) {
    if (rawLower.includes(d.name.toLowerCase())) {
      return d;
    }
  }

  return null;
};

/**
 * Resolves a Department record from the database given an ID, code, branch alias, or composite string.
 * Guarantees CSE and CSE-AIML are strictly isolated.
 */
export const findDepartmentCanonical = async (
  identifier: string | null | undefined,
  options: { transaction?: any } = {}
): Promise<Department | null> => {
  if (!identifier || typeof identifier !== 'string') return null;
  const raw = identifier.trim();
  if (!raw || raw === 'ALL') return null;

  const departments = await Department.findAll({
    attributes: ['id', 'code', 'name', 'type'],
    ...(options.transaction ? { transaction: options.transaction } : {}),
  });

  return resolveDepartmentCanonical(raw, departments);
};
