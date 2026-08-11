import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/layout/PublicLayout";
const sections = [
  { title: "1. Information we collect", body: "We collect institutional records supplied by your school (names, matriculation or staff identifiers, departments and levels), examination activity, and technical session data such as device type, browser and connection events required to protect examination integrity." },
  { title: "2. How information is used", body: "Data is used solely to deliver examinations, authenticate candidates, monitor integrity, mark and publish results, and produce institutional reports. D4EXAM does not sell personal data or use candidate records for advertising." },
  { title: "3. Examination monitoring", body: "During an examination, D4EXAM may record fullscreen exits, tab switches, blocked copy attempts and connection interruptions. Where enabled by your institution, camera and microphone checks are performed. Monitoring is limited to the duration of the examination session." },
  { title: "4. Data retention", body: "Examination records and result data are retained for the period defined by your institution's academic policy. Integrity event logs are retained for the current and preceding academic session unless a longer statutory period applies." },
  { title: "5. Data sharing", body: "Records are visible only to authorised staff of your institution and to D4EXAM personnel performing technical support under contract. We do not disclose data to third parties except where required by law." },
  { title: "6. Security", body: "Data is encrypted in transit and at rest. Access is role-based, and all administrative actions are recorded in an audit log available to your institution." },
  { title: "7. Your rights", body: "Candidates may request access to, or correction of, their personal records through their institution's administrator. Requests relating to platform-level data can be sent to privacy@d4exam.com." },
  { title: "8. Contact", body: "For any privacy question, contact the D4EXAM data protection team at privacy@d4exam.com or through the Support page." },
];

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — D4EXAM" },
      { name: "description", content: "How D4EXAM collects, processes and protects institutional and candidate data." },
      { property: "og:title", content: "Privacy Policy — D4EXAM" },
      { property: "og:description", content: "How D4EXAM collects, processes and protects institutional and candidate data." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <PublicLayout>
      <div className="mx-auto w-full max-w-[1100px] px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-extrabold sm:text-4xl">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: 11 August 2026</p>
        <div className="mt-10 space-y-8">
          {sections.map((s) => (
            <section key={s.title}>
              <h2 className="text-lg font-semibold">{s.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </section>
          ))}
        </div>
      </div>
    </PublicLayout>
  );
}
