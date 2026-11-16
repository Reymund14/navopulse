import { ApiError } from "./http";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidParam(v: string): string {
  if (!UUID_RE.test(v)) throw new ApiError(404, "Not found");
  return v;
}
