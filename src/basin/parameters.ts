export type BasinParameters = {
  householdsPerSettlement: number;
  startingFood: number;
  cropYield: number;
  rainfall: number;
  forestGrowth: number;
};

export const DEFAULT_PARAMETERS: Readonly<BasinParameters> = Object.freeze({
  householdsPerSettlement: 35,
  startingFood: 1,
  cropYield: 1,
  rainfall: 1,
  forestGrowth: 1,
});

export const PARAMETER_FIELDS = [
  { key: 'householdsPerSettlement', label: 'Households per settlement', min: 12, max: 100, step: 1 },
  { key: 'startingFood', label: 'Starting food ×', min: 0.5, max: 2, step: 0.1 },
  { key: 'cropYield', label: 'Crop yield ×', min: 0.5, max: 1.5, step: 0.1 },
  { key: 'rainfall', label: 'Rainfall ×', min: 0.5, max: 1.5, step: 0.1 },
  { key: 'forestGrowth', label: 'Forest regrowth ×', min: 0.25, max: 2, step: 0.05 },
] as const;

export function validateParameters(value: unknown): asserts value is BasinParameters {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid basin parameters.');
  const record = value as Record<string, unknown>;
  for (const field of PARAMETER_FIELDS) {
    const number = record[field.key];
    if (typeof number !== 'number' || !Number.isFinite(number) || number < field.min || number > field.max || (field.key === 'householdsPerSettlement' && !Number.isInteger(number))) {
      throw new Error(`${field.label} must be between ${field.min} and ${field.max}.`);
    }
  }
}
