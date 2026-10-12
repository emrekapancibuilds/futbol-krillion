// Pure entitlement policy, also used in database and service tests.
export type Entitlement = { subscription_id: string; customer_id: string; status: string; paid_through: string | null;
  current_period_end: string | null; cancel_at_period_end: boolean; cancel_at: string | null; synced_at: string; active: boolean };
export const paidAccess = (status: string, paidThrough: string | null, now = Date.now()) =>
  ['active', 'past_due', 'canceled'].includes(status) && !!paidThrough && Date.parse(paidThrough) > now;
export function publicStatus(rows: Entitlement[]) {
  const sorted = [...rows].sort((a, b) => Number(paidAccess(b.status, b.paid_through)) - Number(paidAccess(a.status, a.paid_through)) ||
    Date.parse(b.paid_through ?? '1970-01-01') - Date.parse(a.paid_through ?? '1970-01-01'));
  const s = sorted[0];
  return { premium: !!s && paidAccess(s.status, s.paid_through), canManage: rows.length > 0,
    status: s?.status ?? 'free', paidThrough: s?.paid_through ?? null,
    renewsAt: s && s.status === 'active' && !s.cancel_at_period_end && !s.cancel_at ? s.current_period_end : null,
    cancelsAt: s?.cancel_at ?? (s?.cancel_at_period_end ? s.paid_through : null) };
}
