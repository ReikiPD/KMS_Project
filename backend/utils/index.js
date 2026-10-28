// Shared pure utilities used by controllers and middleware.

// Keep permissive parseInt behavior used by catalogue and review pagination.
const getPositiveInteger = (value, fallback, max) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
};

const PUBLIC_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Copy before omitting private fields; never mutate a database row or snapshot.
const omitFields = (record, fields) => {
  const result = { ...record };
  for (const field of fields) delete result[field];
  return result;
};

module.exports = { getPositiveInteger, PUBLIC_ID_PATTERN, omitFields };
