function isValidCoord(lat1, lng1, lat2, lng2) {
  if (!Number.isFinite(lat1) || !Number.isFinite(lng1) ||
      !Number.isFinite(lat2) || !Number.isFinite(lng2)) return false;
  if (lat1 < -90 || lat1 > 90 || lat2 < -90 || lat2 > 90) return false;
  if (lng1 < -180 || lng1 > 180 || lng2 < -180 || lng2 > 180) return false;
  return true;
}

export function calculateHaversineDistance(lat1, lng1, lat2, lng2) {
  if (!isValidCoord(lat1, lng1, lat2, lng2)) return null;
  const R = 6371; // Earth's radius in km
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatDistanceLabel(distanceKm) {
  if (distanceKm == null || Number.isNaN(distanceKm)) return null;
  const rounded = Math.max(1, Math.round(distanceKm));
  return `~${rounded} km away`;
}
