import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayFor } from './engine.ts';
import { extendSchedule } from './schedule.ts';
const original=[{number:1,date:'2026-10-11',prompts:['p1','p2','p3','p4','p5','p6','p7']}];
const pool=Array.from({length:40},(_,i)=>`p${i}`);
test('UTC midnight changes the shared daily; extension preserves published puzzles and is deterministic',()=>{
 const before=extendSchedule(original,pool,new Date('2026-10-11T23:59:59.999Z'));
 assert.deepEqual(before,original);
 const after=extendSchedule(original,pool,new Date('2026-10-12T00:00:00.000Z'));
 assert.equal(after.length,2);assert.deepEqual(after[0],original[0]);assert.equal(after[1].number,2);
 assert.equal(new Set(after[1].prompts).size,7);
 assert.deepEqual(after,extendSchedule(original,[...pool].reverse(),new Date('2026-10-12T20:00:00Z')));
 const data={unlimited:[],categories:{},subjects:{},days:after,prompt:()=>{throw new Error('not used')},names:()=>[]};
 assert.equal(dayFor(data,new Date('2026-10-11T23:59:59Z'))?.number,1);
 assert.equal(dayFor(data,new Date('2026-10-12T00:00:00Z'))?.number,2);
});

test('the packaged fallback pool can serve a complete daily after the published schedule ends',()=>{
 const published=JSON.parse(readFileSync('data/days.json','utf8'));
 const frozen=JSON.parse(readFileSync('data/fallback-prompts.json','utf8'));
 assert.ok(frozen.length>=7);
 for (const prompt of frozen) assert.ok(existsSync(`data/prompts/${prompt}.json`), `Missing prompt ${prompt}`);
 const next=new Date(Date.parse(published.at(-1).date)+86400000);
 const schedule=extendSchedule(published,frozen,next);
 const day=dayFor({days:schedule,unlimited:[],categories:{},subjects:{},prompt:()=>{throw new Error('unused')},names:()=>[]},next);
 assert.equal(day?.prompts.length,7);
});
