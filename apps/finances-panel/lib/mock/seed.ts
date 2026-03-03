const hashString = (value: string): number => {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
};

export const seeded = (seedKey: string) => {
  let seed = hashString(seedKey) || 1;
  return () => {
    seed ^= seed << 13;
    seed ^= seed >> 17;
    seed ^= seed << 5;
    return Math.abs(seed % 10000) / 10000;
  };
};

export const dayKey = (): string => new Date().toISOString().slice(0, 10);

export const buildSeries = (
  seedKey: string,
  length: number,
  start: number,
): Array<{ label: string; value: number }> => {
  const rnd = seeded(seedKey);
  const values: Array<{ label: string; value: number }> = [];
  let current = start;
  for (let i = 0; i < length; i += 1) {
    const drift = (rnd() - 0.45) * 0.06;
    current = current * (1 + drift);
    values.push({ label: `D${i + 1}`, value: Number(current.toFixed(2)) });
  }
  return values;
};

export const buildSparkline = (
  seedKey: string,
  length = 18,
  start = 100,
): Array<{ value: number }> => {
  return buildSeries(seedKey, length, start).map((point) => ({
    value: point.value,
  }));
};
