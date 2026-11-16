import { formatControlNumber, manilaDateKey, type ControlModuleCode } from "@navopulse/shared";
import { pool, type Queryable } from "./db";

/**
 * Atomically allocate the next control number for a module and Manila date.
 * The upsert takes a row lock, so concurrent requests get distinct sequences.
 */
export async function nextControlNumber(code: ControlModuleCode, at: Date = new Date(), client: Queryable = pool()): Promise<string> {
  const dateKey = manilaDateKey(at);
  const { rows } = await client.query<{ last_value: number }>(
    `INSERT INTO control_sequences (code, date_key, last_value) VALUES ($1, $2, 1)
     ON CONFLICT (code, date_key) DO UPDATE SET last_value = control_sequences.last_value + 1
     RETURNING last_value`,
    [code, dateKey],
  );
  return formatControlNumber(code, dateKey, rows[0]!.last_value);
}
