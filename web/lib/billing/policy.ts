// One successful payment unlocks access without a renewal or expiry date.
export type Entitlement = { purchase_id: string; customer_id: string; payment_intent_id: string;
  status: string; purchased_at: string; synced_at: string; active: boolean };
export const paidAccess = (status: string) => status === 'paid';
export function publicStatus(rows: Entitlement[]) {
  const sorted = [...rows].sort((a, b) => Number(paidAccess(b.status)) - Number(paidAccess(a.status)) ||
    Date.parse(b.purchased_at) - Date.parse(a.purchased_at));
  return { premium: rows.some(s => paidAccess(s.status)), canManage: rows.length > 0,
    status: sorted[0]?.status ?? 'free', purchasedAt: sorted[0]?.purchased_at ?? null };
}
