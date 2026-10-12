begin;
do $$
declare a uuid; b uuid; owner uuid := gen_random_uuid(); c uuid; count_events int; restored boolean;
begin
 a := public.fk_new_session(repeat('a',64));
 b := public.fk_new_session(repeat('b',64));
 insert into public.fk_customers(id,livemode,email) values('cus_codex_verification',false,'verification@example.invalid');
 insert into public.fk_checkouts(visitor_id,customer_id,livemode,stripe_session_id) values(a,'cus_codex_verification',false,'cs_test_codex_verification') returning id into c;
 if not public.fk_acquire_lock('customer:false:cus_codex_verification',owner) then raise exception 'lease unavailable'; end if;
 perform public.fk_sync_customer('cus_codex_verification',false,'verification@example.invalid',owner,
 jsonb_build_array(jsonb_build_object('id','sub_codex_verification','price_id','price_codex_verification','status','active','paid_through',now()+interval '1 day','current_period_end',now()+interval '1 day','cancel_at_period_end',false)),
 c,'cs_test_codex_verification','evt_codex_verification','checkout.session.completed');
 if not exists(select 1 from public.fk_entitlements where visitor_id=a and active) then raise exception 'activation failed'; end if;
 if exists(select 1 from public.fk_entitlements where visitor_id=b) then raise exception 'cross-visitor exposure'; end if;
 perform public.fk_sync_customer('cus_codex_verification',false,'verification@example.invalid',owner,'[]'::jsonb,c,'cs_test_codex_verification','evt_codex_verification','checkout.session.completed');
 select count(*) into count_events from public.fk_webhook_events where id='evt_codex_verification';
 if count_events<>1 or not exists(select 1 from public.fk_entitlements where visitor_id=a and active) then raise exception 'duplicate-event changed access'; end if;
 perform public.fk_sync_customer('cus_codex_verification',false,'verification@example.invalid',owner,
 jsonb_build_array(jsonb_build_object('id','sub_codex_verification','price_id','price_codex_verification','status','canceled','paid_through',now()+interval '1 day','current_period_end',now()+interval '1 day','cancel_at_period_end',true)));
 if not exists(select 1 from public.fk_entitlements where visitor_id=a and active) then raise exception 'paid cancellation access failed'; end if;
 insert into public.fk_recovery_tokens(token_hash,email,livemode) values(repeat('c',64),'verification@example.invalid',false);
 restored:=public.fk_restore(repeat('c',64),'verification@example.invalid',false,repeat('b',64),repeat('d',64),array['cus_codex_verification']);
 if not restored or not exists(select 1 from public.fk_entitlements where visitor_id=b and active) then raise exception 'restoration failed'; end if;
 if public.fk_restore(repeat('c',64),'verification@example.invalid',false,repeat('d',64),repeat('e',64),array['cus_codex_verification']) then raise exception 'token replay succeeded'; end if;
 if exists(select 1 from public.fk_sessions where credential_hash=repeat('b',64) and revoked_at is null) then raise exception 'rotation failed'; end if;
 update public.fk_subscriptions set paid_through=now()-interval '1 second' where id='sub_codex_verification';
 if exists(select 1 from public.fk_entitlements where customer_id='cus_codex_verification' and active) then raise exception 'expiration failed'; end if;
 if has_table_privilege('anon','public.fk_subscriptions','select') or has_table_privilege('authenticated','public.fk_entitlements','select') then raise exception 'public exposure'; end if;
end $$;
rollback;
select 'PASS: activation, owner isolation, duplicate event, paid cancellation, restore, replay, rotation, expiration, browser ACL; all test writes rolled back' as verification;
