/**
 * Shared notes for student exam visibility.
 * Students only see exams the officer has POSTed (status: published | ongoing).
 * Approved / scheduled alone must NOT appear on the student list.
 * closed / completed remain visible only under "Completed / missed".
 */
export const STUDENT_LIST_STATUSES = [
  "published",
  "ongoing",
  "closed",
  "completed",
] as const;

export const STUDENT_STARTABLE_STATUSES = ["published", "ongoing"] as const;
