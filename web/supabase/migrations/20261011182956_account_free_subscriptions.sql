-- Additive account-free billing. No Supabase Auth users; server-only data access.
create table public.fk_visitors (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now());
create table public.fk_sessions (
 credential_hash text primary key check(credential_hash ~ '^[a-f0-9]{64}$'),
 visitor_id uuid not null references public.fk_visitors(id), created_at timestamptz not null default now(),
 expires_at timestamptz not null, revoked_at timestamptz, check(expires_at>created_at));
create index fk_sessions_visitor_idx on public.fk_sessions(visitor_id);
create index fk_sessions_expiry_idx on public.fk_sessions(expires_at);
create table public.fk_customers (
 id text primary key, livemode boolean not null, email text, created_at timestamptz not null default now(),
 synced_at timestamptz, unique(id,livemode));
create index fk_customers_email_idx on public.fk_customers(lower(email)) where email is not null;
create table public.fk_visitor_customers (
 visitor_id uuid not null references public.fk_visitors(id), customer_id text not null references public.fk_customers(id),
 verified_at timestamptz not null default now(), method text not null check(method in ('checkout','email')),
 primary key(visitor_id,customer_id));
create index fk_visitor_customers_customer_idx on public.fk_visitor_customers(customer_id);
create table public.fk_subscriptions (
 id text primary key, customer_id text not null, livemode boolean not null, price_id text not null,
 status text not null check(status in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')),
 paid_through timestamptz, current_period_end timestamptz, cancel_at_period_end boolean not null default false,
 cancel_at timestamptz, synced_at timestamptz not null default now(), created_at timestamptz not null default now(),
 foreign key(customer_id,livemode) references public.fk_customers(id,livemode));
create index fk_subscriptions_customer_idx on public.fk_subscriptions(customer_id,livemode);
create table public.fk_checkouts (
 id uuid primary key default gen_random_uuid(), visitor_id uuid not null references public.fk_visitors(id),
 customer_id text not null, livemode boolean not null, stripe_session_id text unique, url text,
 state text not null default 'pending' check(state in ('pending','complete','expired')),
 created_at timestamptz not null default now(), expires_at timestamptz not null default(now()+interval '30 minutes'),
 foreign key(customer_id,livemode) references public.fk_customers(id,livemode));
create unique index fk_one_pending_checkout on public.fk_checkouts(visitor_id,livemode) where state='pending';
create index fk_checkouts_customer_idx on public.fk_checkouts(customer_id,livemode);
create table public.fk_recovery_tokens (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'), email text not null, livemode boolean not null,
 created_at timestamptz not null default now(), expires_at timestamptz not null default(now()+interval '15 minutes'), used_at timestamptz);
create index fk_recovery_expiry_idx on public.fk_recovery_tokens(expires_at);
create table public.fk_webhook_events (id text primary key,livemode boolean not null,type text not null,processed_at timestamptz not null default now());
create table public.fk_locks (key text primary key,owner uuid not null,expires_at timestamptz not null);
create table public.fk_rate_limits (key text primary key,hits integer not null default 1,expires_at timestamptz not null);
create index fk_rate_limits_expiry_idx on public.fk_rate_limits(expires_at);
create table public.fk_games (
 id uuid primary key default gen_random_uuid(),visitor_id uuid not null references public.fk_visitors(id),
 mode text not null check(mode in ('practice','archive')),day_number integer not null,
 prompts text[] not null check(cardinality(prompts)=7),created_at timestamptz not null default now());
create index fk_games_visitor_recent_idx on public.fk_games(visitor_id,created_at desc);

-- Evaluated on every request: no cron or browser flag is required for expiration.
create view public.fk_entitlements with(security_invoker=true) as
 select vc.visitor_id,s.id as subscription_id,s.customer_id,s.livemode,s.price_id,s.status,s.paid_through,
 s.current_period_end,s.cancel_at_period_end,s.cancel_at,s.synced_at,
 (s.status in ('active','past_due','canceled') and s.paid_through>now()) as active
 from public.fk_visitor_customers vc join public.fk_subscriptions s on s.customer_id=vc.customer_id;

create function public.fk_acquire_lock(p_key text,p_owner uuid) returns boolean
 language plpgsql security invoker set search_path='' as $$ begin
 insert into public.fk_locks(key,owner,expires_at) values(p_key,p_owner,now()+interval '120 seconds')
 on conflict(key) do update set owner=excluded.owner,expires_at=excluded.expires_at where public.fk_locks.expires_at<now();
 return found; end; $$;
create function public.fk_release_lock(p_key text,p_owner uuid) returns void
 language sql security invoker set search_path='' as $$ delete from public.fk_locks where key=p_key and owner=p_owner; $$;
create function public.fk_rate_limit(p_key text,p_limit integer,p_seconds integer) returns boolean
 language plpgsql security invoker set search_path='' as $$ declare n integer; begin
 insert into public.fk_rate_limits(key,hits,expires_at) values(p_key,1,now()+make_interval(secs=>p_seconds))
 on conflict(key) do update set hits=case when public.fk_rate_limits.expires_at<=now() then 1 else public.fk_rate_limits.hits+1 end,
 expires_at=case when public.fk_rate_limits.expires_at<=now() then excluded.expires_at else public.fk_rate_limits.expires_at end
 returning hits into n; return n<=p_limit; end; $$;
create function public.fk_new_session(p_hash text) returns uuid
 language plpgsql security invoker set search_path='' as $$ declare v uuid; begin
 insert into public.fk_visitors default values returning id into v;
 insert into public.fk_sessions(credential_hash,visitor_id,expires_at) values(p_hash,v,now()+interval '180 days'); return v; end; $$;
create function public.fk_rotate_session(p_old_hash text,p_new_hash text) returns boolean
 language plpgsql security invoker set search_path='' as $$ declare v uuid; begin
 update public.fk_sessions set revoked_at=now() where credential_hash=p_old_hash and revoked_at is null and expires_at>now() returning visitor_id into v;
 if v is null then return false; end if;
 insert into public.fk_sessions(credential_hash,visitor_id,expires_at) values(p_new_hash,v,now()+interval '180 days'); return true; end; $$;

-- Fetch Stripe under a customer lease; a fence rejects results from expired workers.
-- Subscription snapshots, ownership, and event completion commit in one transaction.
create function public.fk_sync_customer(p_customer text,p_livemode boolean,p_email text,p_owner uuid,p_subscriptions jsonb,
 p_checkout uuid default null,p_session text default null,p_event text default null,p_event_type text default null)
 returns void language plpgsql security invoker set search_path='' as $$
 declare s jsonb; c public.fk_checkouts; lock_key text; begin
 lock_key:='customer:'||p_livemode::text||':'||p_customer;
 perform 1 from public.fk_locks where key=lock_key and owner=p_owner and expires_at>now() for update;
 if not found then raise exception 'sync lease expired'; end if;
 if p_event is not null and exists(select 1 from public.fk_webhook_events where id=p_event) then return; end if;
 insert into public.fk_customers(id,livemode,email,synced_at) values(p_customer,p_livemode,p_email,now())
 on conflict(id) do update set email=excluded.email,synced_at=now();
 for s in select * from jsonb_array_elements(p_subscriptions) loop
 insert into public.fk_subscriptions(id,customer_id,livemode,price_id,status,paid_through,current_period_end,cancel_at_period_end,cancel_at,synced_at)
 values(s->>'id',p_customer,p_livemode,s->>'price_id',s->>'status',(s->>'paid_through')::timestamptz,
 (s->>'current_period_end')::timestamptz,(s->>'cancel_at_period_end')::boolean,(s->>'cancel_at')::timestamptz,now())
 on conflict(id) do update set status=excluded.status,price_id=excluded.price_id,paid_through=excluded.paid_through,
 current_period_end=excluded.current_period_end,cancel_at_period_end=excluded.cancel_at_period_end,cancel_at=excluded.cancel_at,synced_at=now();
 end loop;
 update public.fk_subscriptions set status='incomplete_expired',paid_through=null,synced_at=now()
 where customer_id=p_customer and livemode=p_livemode and id not in(select value->>'id' from jsonb_array_elements(p_subscriptions));
 if p_checkout is not null then
 select * into c from public.fk_checkouts where id=p_checkout and customer_id=p_customer and livemode=p_livemode for update;
 if not found or(c.stripe_session_id is not null and c.stripe_session_id<>p_session) then raise exception 'checkout binding mismatch'; end if;
 update public.fk_checkouts set state='complete',stripe_session_id=p_session where id=p_checkout;
 insert into public.fk_visitor_customers(visitor_id,customer_id,method) values(c.visitor_id,p_customer,'checkout') on conflict do nothing;
 end if;
 if p_event is not null then insert into public.fk_webhook_events(id,livemode,type) values(p_event,p_livemode,p_event_type) on conflict do nothing; end if;
 end; $$;

-- Email ownership was verified using the hash before Stripe lookup. Consume the token,
-- bind only those verified customers, and rotate the browser credential atomically.
create function public.fk_restore(p_token_hash text,p_email text,p_livemode boolean,p_old_hash text,p_new_hash text,p_customers text[])
 returns boolean language plpgsql security invoker set search_path='' as $$ declare v uuid; c text; begin
 select visitor_id into v from public.fk_sessions where credential_hash=p_old_hash and revoked_at is null and expires_at>now() for update;
 if v is null then return false; end if;
 update public.fk_recovery_tokens set used_at=now() where token_hash=p_token_hash and email=p_email and livemode=p_livemode and used_at is null and expires_at>now();
 if not found then return false; end if;
 foreach c in array p_customers loop
 if not exists(select 1 from public.fk_customers where id=c and livemode=p_livemode and lower(email)=p_email) then raise exception 'restoration customer mismatch'; end if;
 insert into public.fk_visitor_customers(visitor_id,customer_id,method) values(v,c,'email') on conflict do nothing;
 end loop;
 perform public.fk_rotate_session(p_old_hash,p_new_hash); return true; end; $$;

-- Intentionally no anon/authenticated policies: private data is inaccessible to browsers.
do $$ declare t text; f record; begin
 foreach t in array array['fk_visitors','fk_sessions','fk_customers','fk_visitor_customers','fk_subscriptions','fk_checkouts',
 'fk_recovery_tokens','fk_webhook_events','fk_locks','fk_rate_limits','fk_games'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on table public.%I from public,anon,authenticated',t);
 execute format('grant select,insert,update,delete on table public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname like 'fk_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop; end $$;
revoke all on public.fk_entitlements from public,anon,authenticated;
grant select on public.fk_entitlements to service_role;
