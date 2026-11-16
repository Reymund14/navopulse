import { MODULE_CODES, type ControlModuleCode, type IncidentModule } from "./constants";

/**
 * Control numbers look like NVP-EMR-20261019-000123.
 * The date part is the calendar date in Asia/Manila (UTC+8, no DST), so a
 * report filed at 7am local on Oct 19 never gets an Oct 18 number.
 */
export const CONTROL_NUMBER_RE = /^NVP-(EMR|CIV|TRF|INQ)-(\d{8})-(\d{6})$/;

export function manilaDateKey(date: Date = new Date()): string {
  const manila = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const y = manila.getUTCFullYear();
  const m = String(manila.getUTCMonth() + 1).padStart(2, "0");
  const d = String(manila.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function moduleCode(module: IncidentModule | "inquiry"): ControlModuleCode {
  return MODULE_CODES[module];
}

export function formatControlNumber(code: ControlModuleCode, dateKey: string, sequence: number): string {
  if (!/^\d{8}$/.test(dateKey)) throw new Error(`Invalid date key: ${dateKey}`);
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999_999) {
    throw new Error(`Sequence out of range: ${sequence}`);
  }
  return `NVP-${code}-${dateKey}-${String(sequence).padStart(6, "0")}`;
}

export function parseControlNumber(value: string) {
  const m = CONTROL_NUMBER_RE.exec(value.trim().toUpperCase());
  if (!m) return null;
  return { code: m[1] as ControlModuleCode, dateKey: m[2]!, sequence: Number(m[3]) };
}
