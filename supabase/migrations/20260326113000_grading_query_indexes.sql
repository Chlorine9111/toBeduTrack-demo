create index if not exists idx_grading_submissions_session_created
  on public.grading_submissions (session_id, created_at desc);

create index if not exists idx_grading_answers_submission_question
  on public.grading_answers (submission_id, question_number asc);
