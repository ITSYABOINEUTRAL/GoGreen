'use strict';

const {
  checkCoordinateGeoFence,
  haversineKm,
} = require('../utils/geocheck');

describe('haversineKm', () => {
  test('returns 0 for identical points', () => {
    expect(haversineKm(0, 0, 0, 0)).toBe(0);
    expect(haversineKm(51.5074, -0.1278, 51.5074, -0.1278)).toBe(0);
  });

  test('computes a known distance within tolerance', () => {
    // 0,0 to 0,1 is one degree of longitude at the equator ≈ 111.19 km
    const distance = haversineKm(0, 0, 0, 1);
    expect(distance).toBeGreaterThan(111.1);
    expect(distance).toBeLessThan(111.3);
  });
});

describe('checkCoordinateGeoFence', () => {
  const validFence = {
    geo_fencing_enabled: 1,
    geo_fence_lat: '-1.2921',
    geo_fence_lng: '36.8219',
    geo_fence_radius_km: '10',
  };

  test('fence disabled → checked false, allowed true', () => {
    const result = checkCoordinateGeoFence(
      { ...validFence, geo_fencing_enabled: 0 },
      -1.2921,
      36.8219,
    );
    expect(result.checked).toBe(false);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeNull();
  });

  test('invalid fence lat → fail-open (checked false, allowed true)', () => {
    const result = checkCoordinateGeoFence(
      { ...validFence, geo_fence_lat: 'abc' },
      -1.2921,
      36.8219,
    );
    expect(result.checked).toBe(false);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeNull();
  });

  test('radius_km of 0 → fail-open (checked false, allowed true)', () => {
    const result = checkCoordinateGeoFence(
      { ...validFence, geo_fence_radius_km: '0' },
      -1.2921,
      36.8219,
    );
    expect(result.checked).toBe(false);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeNull();
  });

  test('missing buyer coordinates → rejected with coordinates_required', () => {
    const result = checkCoordinateGeoFence(validFence, null, null);
    expect(result.checked).toBe(true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('coordinates_required');
  });

  test('buyer inside radius → allowed true, reason null', () => {
    // ~1 km north of the fence centre
    const result = checkCoordinateGeoFence(validFence, -1.2831, 36.8219);
    expect(result.checked).toBe(true);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.distanceKm).toBeLessThan(10);
  });

  test('buyer outside radius → allowed false, reason outside_delivery_area', () => {
    // ~111 km north of the fence centre
    const result = checkCoordinateGeoFence(validFence, -0.2921, 36.8219);
    expect(result.checked).toBe(true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('outside_delivery_area');
    expect(result.distanceKm).toBeGreaterThan(10);
  });
});
