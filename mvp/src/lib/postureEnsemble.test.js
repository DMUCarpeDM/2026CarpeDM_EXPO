import test from 'node:test';
import assert from 'node:assert/strict';
import {postureFeatures} from './postureEnsemble.js';
const pose=()=>Array.from({length:33},(_,i)=>({x:i===11?.3:i===12?.7:.5,y:.5,z:0}));
test('features match notebook order and shoulder normalization',()=>{
 const f=postureFeatures(pose());
 assert.equal(f.length,27);
 for (const [i, value] of [-.5,0,0,.5,0,0].entries()) assert.ok(Math.abs(f[i+3]-value)<1e-12);
});
test('no detection, missing joint, out-of-frame and tiny shoulders abstain',()=>{
 assert.equal(postureFeatures(undefined),null);
 const outside=pose();outside[23].x=1.1;assert.equal(postureFeatures(outside),null);
 const missing=pose();missing[15]=undefined;assert.equal(postureFeatures(missing),null);
 const invalid=pose();invalid[0].z=NaN;assert.equal(postureFeatures(invalid),null);
 const p=pose();p[12]=p[11];assert.equal(postureFeatures(p),null);
});
