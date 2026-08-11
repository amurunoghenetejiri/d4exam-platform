import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Mail, Phone, Clock } from "lucide-react";
import { toast } from "sonner";

const faqs = [
  { q: "A candidate lost connection mid-examination. What happens?", a: "Answers are saved continuously. When the connection returns, the candidate resumes at the same question with the remaining time intact." },
  { q: "How do we reset a candidate's password?", a: "School administrators can reset any candidate password from Admin → Students → Edit Student. Candidates can also use the Forgot Password page." },
  { q: "Can results be released automatically?", a: "Yes. Each examination has result settings that control instant release, or release only after examination officer approval." },
  { q: "Which file formats are supported for student import?", a: "CSV and Excel (.xlsx). Download the official template from Admin → Student Import to avoid validation errors." },
];

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — D4EXAM" },
      { name: "description", content: "Get help with examinations, accounts, imports and result publication from the D4EXAM support team." },
      { property: "og:title", content: "Support — D4EXAM" },
      { property: "og:description", content: "Get help with examinations, accounts, imports and result publication from the D4EXAM support team." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <PublicLayout>
      <div className="mx-auto w-full max-w-[1100px] px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-extrabold sm:text-4xl">Support</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Candidates should contact their school administrator first. Institutional staff can reach
          the D4EXAM team directly using the form below.
        </p>
        <div className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <form
            className="surface-panel space-y-4 p-6"
            onSubmit={(e) => { e.preventDefault(); toast.success("Support request submitted. Reference #SR-40912"); }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" required placeholder="Grace Okonkwo" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required placeholder="you@school.edu" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="school">School / Institution code</Label>
              <Input id="school" placeholder="ESU" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" required placeholder="Candidate cannot access CSC101 exam" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <Textarea id="message" required rows={6} placeholder="Describe the issue, including matric numbers and the examination affected." />
            </div>
            <Button type="submit">Submit request</Button>
          </form>
          <div className="space-y-6">
            <div className="surface-panel p-6">
              <h2 className="text-base font-semibold">Contact channels</h2>
              <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><Mail className="h-4 w-4 text-primary" aria-hidden /> support@d4exam.com</li>
                <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-primary" aria-hidden /> +234 700 433 9266</li>
                <li className="flex items-center gap-2"><Clock className="h-4 w-4 text-primary" aria-hidden /> 24/7 during examination periods</li>
              </ul>
            </div>
            <div className="surface-panel p-6">
              <h2 className="text-base font-semibold">Common questions</h2>
              <Accordion type="single" collapsible className="mt-2">
                {faqs.map((f, i) => (
                  <AccordionItem key={f.q} value={`i${i}`}>
                    <AccordionTrigger className="text-left text-sm">{f.q}</AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
