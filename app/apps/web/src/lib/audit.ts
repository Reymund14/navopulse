import { clientIp } from "./http";
import { query, type Queryable } from "./db";

/** Append-only audit trail for every administrative action and PII access. */
export async function audit(
  req: Request | null,
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  before: unknown = null,
  after: unknown = null,
  client?: Queryable,
) {
  await query(
    `INSERT INTO audit_logs (actor_id, action, entity, entity_id, before, after, ip, user_agent) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [actorId, action, entity, entityId, before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after),
      req ? clientIp(req) : null, req?.headers.get("user-agent")?.slice(0, 300) ?? null],
    client,
  );
}
