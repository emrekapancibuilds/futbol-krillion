import { test, mock, after } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_URL='https://fixture.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_fixture';
let verifiedUser: {email:string;email_confirmed_at:string|null}|null=null;
let rejectProof=false;
let request:unknown;
mock.module('@supabase/supabase-js',{namedExports:{createClient:(url:string,key:string,options:Record<string,unknown>)=>{
 assert.equal(url,process.env.SUPABASE_URL);assert.equal(key,'sb_publishable_fixture');
 assert.deepEqual(options.auth,{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,flowType:'implicit'});
 return {auth:{
  signInWithOtp:async(input:unknown)=>{request=input;return {error:null};},
  getUser:async(token:string)=>{assert.equal(token,'signed.email.proof');return {data:{user:verifiedUser},error:rejectProof?{message:'invalid signature'}:null};}
 }};
}}});
const email=await import('../lib/billing/email.ts');
after(()=>mock.restoreAll());
test('email verification uses Supabase magic links and does not persist an Auth session',async()=>{
 await email.sendVerification('owner@example.com','http://localhost:3100/billing/restore?request=fixture');
 assert.deepEqual(request,{email:'owner@example.com',options:{shouldCreateUser:true,emailRedirectTo:'http://localhost:3100/billing/restore?request=fixture'}});
});
test('only a Supabase-validated, confirmed email is accepted',async()=>{
 await assert.rejects(()=>email.verifiedEmail('forged'),/invalid or expired/);
 verifiedUser={email:'Owner@Example.com',email_confirmed_at:null};
 await assert.rejects(()=>email.verifiedEmail('signed.email.proof'),/invalid or expired/);
 verifiedUser.email_confirmed_at=new Date().toISOString();rejectProof=true;
 await assert.rejects(()=>email.verifiedEmail('signed.email.proof'),/invalid or expired/);
 rejectProof=false;assert.equal(await email.verifiedEmail('signed.email.proof'),'owner@example.com');
});
