import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {REPO} from '../scripts/lib/fidelity.mjs';
import {sync} from '../scripts/sync.mjs';

test('every skill carries the current tools, shared references and sibling rubrics (no drift)',()=>{
 assert.deepEqual(sync({check:true}),[]);
});
test('PROVENANCE.md files are generated from provenance.json',()=>{
 const r=spawnSync(process.execPath,[path.join(REPO,'scripts/provenance.mjs'),'--check'],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});
