/** True when email is system-generated (not a real student Gmail). */
export function isSyntheticStudentEmail(email: string | null | undefined): boolean {
  if (!email) return true;
  const e = email.trim().toLowerCase();
  if (!e) return true;
  return (
    e.endsWith(".student.d4exam.local") ||
    e.endsWith("@placeholder.local") ||
    e.includes(".student.d4exam.local")
  );
}
