-- One-time purchases are separate from the legacy subscription history.
create table public.fk_purchases (
 id text primary key, customer_id text not null, livemode boolean not null, price_id text not null,
 payment_intent_id text not null unique, status text not null check(status in ('paid','unpaid','refunded','disputed','revoked')),
 purchased_at timestamptz not null, synced_at timestamptz not null default now(),
 foreign key(customer_id,livemode) references public.fk_customers(id,livemode));
create index fk_purchases_customer_idx on public.fk_purchases(customer_id,livemode);
alter table public.fk_purchases enable row level security;
revoke all on public.fk_purchases from public,anon,authenticated;
grant select,insert,update,delete on public.fk_purchases to service_role;
create view public.fk_purchase_entitlements with(security_invoker=true) as
 select v.visitor_id,p.id as purchase_id,p.customer_id,p.livemode,p.price_id,p.payment_intent_id,
 p.status,p.purchased_at,p.synced_at,(p.status='paid') as active
 from public.fk_visitor_customers v join public.fk_purchases p on p.customer_id=v.customer_id;
revoke all on public.fk_purchase_entitlements from public,anon,authenticated;
grant select on public.fk_purchase_entitlements to service_role;

-- Snapshot, ownership and event completion are committed together under a fenced lease.
create function public.fk_sync_purchases(p_customer text,p_livemode boolean,p_email text,p_owner uuid,p_purchases jsonb,
 p_checkout uuid default null,p_session text default null,p_event text default null,p_event_type text default null)
 returns void language plpgsql security invoker set search_path='' as $$
 declare s jsonb; c public.fk_checkouts; begin
 perform 1 from public.fk_locks where key='customer:'||p_livemode::text||':'||p_customer
 and owner=p_owner and expires_at>now() for update;
 if not found then raise exception 'sync lease expired'; end if;
 if p_event is not null and exists(select 1 from public.fk_webhook_events where id=p_event) then return; end if;
 insert into public.fk_customers(id,livemode,email,synced_at) values(p_customer,p_livemode,p_email,now())
 on conflict(id) do update set email=excluded.email,synced_at=now();
 for s in select * from jsonb_array_elements(p_purchases) loop
 insert into public.fk_purchases(id,customer_id,livemode,price_id,payment_intent_id,status,purchased_at,synced_at)
 values(s->>'id',p_customer,p_livemode,s->>'price_id',s->>'payment_intent_id',s->>'status',(s->>'purchased_at')::timestamptz,now())
 on conflict(id) do update set status=excluded.status,synced_at=now()
 where fk_purchases.customer_id=excluded.customer_id and fk_purchases.livemode=excluded.livemode
 and fk_purchases.payment_intent_id=excluded.payment_intent_id and fk_purchases.price_id=excluded.price_id;
 if not found then raise exception 'purchase binding mismatch'; end if;
 end loop;
 update public.fk_purchases set status='revoked',synced_at=now()
 where customer_id=p_customer and livemode=p_livemode and id not in(select value->>'id' from jsonb_array_elements(p_purchases));
 if p_checkout is not null then
 select * into c from public.fk_checkouts where id=p_checkout and customer_id=p_customer and livemode=p_livemode for update;
 if not found or(c.stripe_session_id is not null and c.stripe_session_id<>p_session) then raise exception 'checkout binding mismatch'; end if;
 if not exists(select 1 from public.fk_purchases where id=p_session and customer_id=p_customer and livemode=p_livemode)
 then raise exception 'checkout purchase missing'; end if;
 update public.fk_checkouts set state='complete',stripe_session_id=p_session where id=p_checkout;
 insert into public.fk_visitor_customers(visitor_id,customer_id,method) values(c.visitor_id,p_customer,'checkout') on conflict do nothing;
 end if;
 if p_event is not null then insert into public.fk_webhook_events(id,livemode,type) values(p_event,p_livemode,p_event_type) on conflict do nothing; end if;
 end; $$;
revoke all on function public.fk_sync_purchases(text,boolean,text,uuid,jsonb,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.fk_sync_purchases(text,boolean,text,uuid,jsonb,uuid,text,text,text) to service_role;
