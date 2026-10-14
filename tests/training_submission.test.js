import test from 'node:test';
import assert from 'node:assert/strict';
import {activeTraining,findTrainingSubmission} from '../Browser_SDK/src/training-submission.js';

test('pending dataset preparation keeps the training controls locked',()=>{
  for(const status of ['preparing','running','stopping'])assert(activeTraining({status}));
  for(const status of ['failed','completed','interrupted','stopped'])assert(!activeTraining({status}));
});
test('submission reconciliation uses its request ID and ignores unrelated jobs',()=>{
  const submission={request_id:'request-123',dataset_id:'dataset-1',started_at_ms:10000};
  assert.equal(findTrainingSubmission([{id:'wrong',request_id:'other',dataset_id:'dataset-1',created_at_ms:11000}],submission),null);
  assert.equal(findTrainingSubmission([{id:'right',request_id:'request-123',created_at_ms:10001}],submission).id,'right');
  assert.equal(findTrainingSubmission([{id:'old',dataset_id:'dataset-1',created_at_ms:1},{id:'right',dataset_id:'dataset-1',created_at_ms:10100}],submission).id,'right');
});
