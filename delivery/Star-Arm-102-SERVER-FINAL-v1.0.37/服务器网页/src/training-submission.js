export const activeTraining = job => ['preparing', 'running', 'stopping'].includes(job?.status);

export function findTrainingSubmission(jobs, submission) {
  if (!submission) return null;
  return jobs.filter(job => job.request_id
    ? job.request_id === submission.request_id
    : job.dataset_id === submission.dataset_id && Number(job.created_at_ms) >= submission.started_at_ms - 2000)
    .sort((a, b) => Number(b.created_at_ms || 0) - Number(a.created_at_ms || 0))[0] || null;
}
