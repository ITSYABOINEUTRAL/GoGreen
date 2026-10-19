import { describe, it, expect } from 'vitest';
import { calculateHaversineDistance, formatDistanceLabel } from '../utils/distance';

describe('calculateHaversineDistance', () => {
  it('returns 0 for identical coordinates', () => {
    expect(calculateHaversineDistance(40.7128, -74.0060, 40.7128, -74.0060)).toBeCloseTo(0, 6);
  });

  it('is symmetric: distance(a, b) === distance(b, a)', () => {
    const ab = calculateHaversineDistance(40.7128, -74.0060, 51.5074, -0.1278);
    const ba = calculateHaversineDistance(51.5074, -0.1278, 40.7128, -74.0060);
    expect(ab).toBeCloseTo(ba, 9);
  });

  it('matches the known great-circle distance between New York City and London', () => {
    // NYC (40.7128 N, 74.0060 W) to London (51.5074 N, 0.1278 W).
    // The real-world great-circle distance is ~5570 km; allow a 5 km
    // tolerance for the spherical-earth approximation this helper uses.
    const distance = calculateHaversineDistance(40.7128, -74.0060, 51.5074, -0.1278);
    expect(distance).toBeCloseTo(5570, -1); // within ~5 km
  });

  it('returns null (not NaN) for undefined, NaN, or null coordinates', () => {
    expect(calculateHaversineDistance(undefined, undefined, undefined, undefined)).toBeNull();
    expect(calculateHaversineDistance(NaN, 0, 1, 1)).toBeNull();
    expect(calculateHaversineDistance(null, null, null, null)).toBeNull();
    expect(calculateHaversineDistance(Infinity, 0, 1, 1)).toBeNull();
  });

  it('returns null for out-of-range latitude', () => {
    expect(calculateHaversineDistance(91, 0, 1, 1)).toBeNull();
    expect(calculateHaversineDistance(-91, 0, 1, 1)).toBeNull();
  });

  it('returns null for out-of-range longitude', () => {
    expect(calculateHaversineDistance(0, 181, 1, 1)).toBeNull();
    expect(calculateHaversineDistance(0, -181, 1, 1)).toBeNull();
  });

  it('returns known distance (~111 km) between two points 1 degree apart on a meridian', () => {
    const dist = calculateHaversineDistance(0, 0, 1, 0);
    expect(dist).not.toBeNull();
    expect(Math.abs(dist - 111.195)).toBeLessThan(0.01);
  });
});

describe('formatDistanceLabel', () => {
  it('returns null for null input', () => {
    expect(formatDistanceLabel(null)).toBeNull();
  });

  it('returns null for NaN input', () => {
    expect(formatDistanceLabel(NaN)).toBeNull();
  });

  it('formats a valid distance', () => {
    expect(formatDistanceLabel(5)).toBe('~5 km away');
  });
});
