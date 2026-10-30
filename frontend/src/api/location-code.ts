const NUMBER = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)";
const LOCATION_CODE = new RegExp(`^(${NUMBER})-(${NUMBER})$`);

export function formatLocationCode(latitude: number, longitude: number) {
  return `${latitude}-${longitude}`;
}

export function parseLocationCode(code: string): { latitude: number; longitude: number } | null {
  const match = LOCATION_CODE.exec(code.trim());
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}
