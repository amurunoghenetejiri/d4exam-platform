/**
 * D4EXAM role-based Manual Guide — accurate to implementation.
 * Content is static (no per-page Supabase). Super Admin is excluded by product rule.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Search,
  Shield,
  GraduationCap,
  Users,
  FileText,
  Camera,
  Monitor,
  Clock,
  AlertTriangle,
  Settings,
  Bell,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ManualRole =
  | "student"
  | "teacher"
  | "examination_officer"
  | "school_admin"
  | "super_admin";

export type ManualSection = {
  id: string;
  title: string;
  intro: string;
  body: string[];
  bullets?: string[];
  whatYouCanDo?: string[];
  warnings?: string[];
  /** Inline link labels that map to in-app routes for this role */
  linkHints?: string[];
};

type RouteMap = Record<string, string>;

function routesFor(role: ManualRole): RouteMap {
  if (role === "student") {
    return {
      Dashboard: "/student",
      Examinations: "/student/examinations",
      "My Exams": "/student/examinations",
      Results: "/student/results",
      "My Results": "/student/results",
      Courses: "/student/courses",
      Materials: "/student/materials",
      Notifications: "/student/notifications",
      Profile: "/student/profile",
      Settings: "/student/settings",
      "Contact officer": "/student/contact-officer",
      History: "/student/history",
    };
  }
  if (role === "teacher") {
    return {
      Dashboard: "/teacher",
      Examinations: "/teacher/examinations",
      Courses: "/teacher/courses",
      "Question Bank": "/teacher/courses",
      Marking: "/teacher/marking",
      "Live Monitor": "/teacher/live-exams",
      Integrity: "/teacher/integrity",
      "Exam Security": "/teacher/exam-security",
      Notifications: "/teacher/notifications",
      Profile: "/teacher/profile",
      Settings: "/teacher/settings",
    };
  }
  if (role === "examination_officer") {
    return {
      Dashboard: "/officer",
      Approvals: "/officer/approvals",
      "Live Monitor": "/officer/live-monitor",
      Integrity: "/officer/integrity",
      Results: "/officer/results",
      "Post to students": "/officer/post-to-students",
      "Student reports": "/officer/reports",
      Carryovers: "/officer/carryovers",
      Notifications: "/officer/notifications",
      Profile: "/officer/profile",
      Settings: "/officer/settings",
    };
  }
  // school_admin
  return {
    Dashboard: "/admin",
    Students: "/admin/students",
    Teachers: "/admin/teachers",
    Officers: "/admin/officers",
    Courses: "/admin/courses",
    Examinations: "/admin/examinations",
    Results: "/admin/results",
    Structure: "/admin/structure",
    Departments: "/admin/departments",
    Levels: "/admin/levels",
    Sessions: "/admin/sessions",
    Notifications: "/admin/notifications",
    Profile: "/admin/profile",
    Settings: "/admin/settings",
  };
}

function roleTitle(role: ManualRole): string {
  switch (role) {
    case "student":
      return "Student";
    case "teacher":
      return "Teacher";
    case "examination_officer":
      return "Departmental Officer";
    case "school_admin":
      return "School Admin";
    default:
      return "User";
  }
}

function sectionIcon(id: string) {
  const map: Record<string, typeof BookOpen> = {
    welcome: BookOpen,
    overview: FileText,
    start: GraduationCap,
    exams: FileText,
    security: Shield,
    tab: Monitor,
    face: Camera,
    screen: Monitor,
    timer: Clock,
    violations: AlertTriangle,
    results: FileText,
    settings: Settings,
    notifications: Bell,
    offline: WifiOff,
    teacher: Users,
    create: FileText,
    monitor: Monitor,
    officer: Shield,
    admin: Users,
  };
  return map[id] || BookOpen;
}

/** Shared facts from exam-security defaults + CbtExamSession implementation */
const SHARED_SECURITY_FACTS = {
  defaults:
    "Default security for a new paper (teachers can change these per exam): fullscreen on, tab monitoring on, max tab switches 5, copy/paste blocked, questions and options randomized, camera and face detection on, max face warnings 5, threshold action flag, pause duration 300 seconds (5 minutes), results visible after officer release.",
  tabLeave:
    "When tab monitoring is on and you leave the examination screen (tab hidden, app background, or page hide), D4EXAM counts a tab switch. Answered questions stay locked (you cannot change them). Unanswered questions are replaced from the remaining bank when possible, and a banner explains that unanswered questions changed. The new order can be saved on your attempt.",
  threshold:
    "When the configured maximum tab switches is reached, the paper’s threshold action runs: warn or flag (banner / integrity flag), pause (timed pause using the paper’s pause duration), terminate, or auto-submit — depending on what the teacher set.",
  face:
    "If face detection is enabled, the camera is required. Events such as no face, multiple faces, or a blocked camera are logged. After the configured face warnings, the face violation action may warn, flag, pause, or terminate according to the paper settings.",
  screen:
    "Screen share can be disabled, optional, or required per paper. On Android, the system MediaProjection permission is used. Officers and teachers may receive live camera and screen frames while a student is writing, when those features are enabled and the device allows them.",
  online:
    "Starting and writing a live examination requires a working internet connection so attempts, heartbeats, and integrity events can sync. Some lists (courses, past data) may show cached offline content, but live CBT is online.",
};

export function sectionsFor(role: ManualRole): ManualSection[] {
  if (role === "super_admin") return [];

  const commonIntro: ManualSection[] = [
    {
      id: "welcome",
      title: "Welcome to D4EXAM",
      intro: "Your in-app guide to how D4EXAM works for your role.",
      body: [
        "D4EXAM is a computer-based testing platform for schools: create and approve papers, run secure exams with integrity monitoring, and release results through a clear workflow.",
        "This Manual describes behaviour implemented in the app — not marketing claims. Use the search box to jump to a topic. Blue text links open the matching page inside the app.",
      ],
      linkHints: ["Dashboard", "Settings"],
    },
    {
      id: "overview",
      title: "How D4EXAM fits together",
      intro: "Teachers prepare papers · officers approve and release · students write · results stay controlled.",
      body: [
        "Teachers build courses, questions, and examinations, then submit papers for approval.",
        "Departmental officers review security and schedule, approve, then Post to students so eligible students can see the paper.",
        "Students only see examinations that are posted (published / ongoing for start). After submission, scores stay hidden until the officer releases results when that rule applies.",
        "Integrity events (tab leave, face, screen) support live monitoring and later review.",
      ],
    },
  ];

  if (role === "student") {
    return [
      ...commonIntro,
      {
        id: "start",
        title: "Getting started",
        intro: "Sign in, open your student portal, and check the dashboard.",
        body: [
          "After login you land on the Student Dashboard. Ready exams, notifications, and shortcuts appear when data loads from your school.",
          "Use the menu for My Exams, Results, Courses, Materials, Contact officer, Profile, and Settings.",
        ],
        linkHints: ["Dashboard", "Examinations", "Settings", "Profile"],
        whatYouCanDo: [
          "Open My Exams to see papers posted for you.",
          "Open Settings for language, notifications, biometric unlock, and offline status.",
          "Use Contact officer to message your departmental officer about an exam issue.",
        ],
      },
      {
        id: "exams",
        title: "Starting an examination",
        intro: "Only posted papers appear. Internet is required to start and write.",
        body: [
          "Open My Exams. Papers show when the officer has posted them (not merely approved).",
          "Read the instructions and security requirements. You may be asked for camera, microphone, and/or screen sharing depending on the paper.",
          "When you start, an attempt is created, the timer follows the attempt end time, and you answer the number of questions set for that paper (not necessarily the whole bank).",
        ],
        linkHints: ["Examinations"],
        warnings: [
          SHARED_SECURITY_FACTS.online,
          "Follow on-screen permission prompts. Denying required camera or screen share may block or limit the attempt according to the paper rules.",
        ],
      },
      {
        id: "security",
        title: "Examination security (overview)",
        intro: "Each paper has its own security settings from the teacher.",
        body: [
          SHARED_SECURITY_FACTS.defaults,
          "Your invigilator screen may require fullscreen. Copy and paste can be blocked. Calculators appear only if the teacher allowed them.",
        ],
        linkHints: ["Examinations"],
      },
      {
        id: "tab",
        title: "Leaving the exam screen (tab monitoring)",
        intro: "What happens when you switch away from the examination.",
        body: [
          SHARED_SECURITY_FACTS.tabLeave,
          SHARED_SECURITY_FACTS.threshold,
          "Blur alone (for example opening the on-screen keyboard or a permission dialog) does not count as a leave unless the page is actually hidden.",
        ],
        warnings: [
          "Do not switch apps or tabs during a monitored exam. Answered items stay locked; unanswered items may change.",
        ],
      },
      {
        id: "face",
        title: "Camera and face monitoring",
        intro: "When the paper requires face detection.",
        body: [
          SHARED_SECURITY_FACTS.face,
          "Keep your face clearly in view. Covering the camera or leaving the frame can generate warnings recorded for the officer.",
        ],
      },
      {
        id: "screen",
        title: "Screen sharing",
        intro: "When the paper requests screen capture.",
        body: [SHARED_SECURITY_FACTS.screen],
      },
      {
        id: "questions",
        title: "Questions, answers, and randomization",
        intro: "How your paper is built and locked.",
        body: [
          "The number of questions you must answer is set on the examination (questions to answer), not always the full course bank.",
          "If randomize questions is on, order is shuffled for your attempt. If randomize options is on, multiple-choice options are shuffled while scoring still matches the correct text.",
          "After a tab leave, answers you already submitted stay locked and greyed out; you cannot change them. Unanswered slots may receive different questions from the bank.",
        ],
      },
      {
        id: "timer",
        title: "Timer and submission",
        intro: "The attempt end time is authoritative.",
        body: [
          "The countdown follows the server-side attempt timing. When time ends, the app submits according to the session rules.",
          "You can submit early when the paper allows. Officer pause freezes your interaction until resume; tab-violation pause may use a countdown from the paper’s pause duration.",
        ],
      },
      {
        id: "results",
        title: "Results and history",
        intro: "Scores appear when release rules allow.",
        body: [
          "Open Results to see each paper’s status: under officer review, held, awaiting teacher mark, terminated, or released scores.",
          "Default visibility is after officer release — you may see status messages before scores appear.",
        ],
        linkHints: ["Results", "History"],
      },
      {
        id: "notifications",
        title: "Notifications",
        intro: "Exam posts, replies, and system messages.",
        body: [
          "Notifications list messages for your account. Enable push/notifications in Settings when available on your device.",
          "Officer replies to Contact officer reports can notify you when delivery is configured.",
        ],
        linkHints: ["Notifications", "Settings", "Contact officer"],
      },
      {
        id: "settings",
        title: "Settings and offline",
        intro: "Preferences, lock, and cached data.",
        body: [
          "Settings covers language, appearance, reduced motion, notification preferences, app lock / biometric unlock where the device supports it, and offline storage status.",
          SHARED_SECURITY_FACTS.online,
        ],
        linkHints: ["Settings", "Profile"],
      },
      {
        id: "tips",
        title: "Quick reference",
        intro: "Short checklist before you write.",
        body: [
          "Stable internet, charged device, allow required permissions, stay on the exam screen, keep one face in camera view, and submit only when finished.",
        ],
        bullets: [
          "My Exams → only posted papers",
          "Tab leave → answered locked, unanswered may change",
          "Results → often after officer release",
          "Contact officer → report problems with name and exam",
        ],
        linkHints: ["Examinations", "Results", "Contact officer", "Settings"],
      },
    ];
  }

  if (role === "teacher") {
    return [
      ...commonIntro,
      {
        id: "start",
        title: "Teacher workspace",
        intro: "Dashboard, courses, examinations, marking, and live views.",
        body: [
          "Your dashboard summarises courses and papers. Use Courses for the question bank, Examinations to create and submit papers, Marking for scripts that need review, and Live Monitor for your papers in progress.",
        ],
        linkHints: ["Dashboard", "Courses", "Examinations", "Marking", "Live Monitor"],
      },
      {
        id: "create",
        title: "Creating an examination",
        intro: "From bank size to questions students must answer.",
        body: [
          "Create a paper under Examinations: title, course, duration, schedule, instructions, and questions to answer.",
          "Students receive the configured number of questions from the course bank (not automatically the entire bank). Meta and security are stored with the examination so officers and CBT read the same rules.",
          "Submit for approval when ready. Students will not see the paper until a departmental officer approves and posts it.",
        ],
        linkHints: ["Examinations", "Courses"],
      },
      {
        id: "security",
        title: "Teacher examination security",
        intro: "Configure monitoring per paper (or save defaults).",
        body: [
          SHARED_SECURITY_FACTS.defaults,
          "Set max tab switches, threshold action (warn, flag, pause, terminate, auto-submit), pause duration, face detection and face violation action, camera/microphone/screen share mode, randomization, calculator, and result visibility.",
          "Exam Security and the examination form write these into exam settings used by the CBT session.",
        ],
        linkHints: ["Exam Security", "Examinations"],
        warnings: [
          SHARED_SECURITY_FACTS.tabLeave,
          "Officers may still pause, resume, submit, or terminate live attempts from Live Monitor.",
        ],
      },
      {
        id: "monitor",
        title: "Monitoring students",
        intro: "Live exams for papers you own or are assigned.",
        body: [
          "Live Monitor focuses on active writers. Camera and screen frames follow the same pipeline as officers when enabled.",
          "Integrity events appear for review. Respect privacy and school policy when acting on signals.",
        ],
        linkHints: ["Live Monitor", "Integrity"],
      },
      {
        id: "results",
        title: "Marking and results",
        intro: "Objective scoring vs teacher marking.",
        body: [
          "Objective items are scored from the answer key after shuffle-aware matching. Papers needing manual marking appear under Marking.",
          "Final student visibility often waits for officer release depending on result_visibility.",
        ],
        linkHints: ["Marking", "Examinations"],
      },
      {
        id: "settings",
        title: "Settings and notifications",
        intro: "Account preferences for teachers.",
        body: [
          "Use Settings for notifications, biometric unlock, appearance, and offline cache status. Notifications carry approval outcomes and system messages.",
        ],
        linkHints: ["Settings", "Notifications", "Profile"],
      },
      {
        id: "tips",
        title: "Quick reference",
        intro: "Teacher checklist.",
        bullets: [
          "Build questions in Courses / bank first",
          "Set questions-to-answer and security before submit",
          "Officer must approve and Post before students see the paper",
          "Tab and face rules are enforced in the student CBT session",
        ],
        body: ["Keep security settings aligned with your department policy."],
        linkHints: ["Examinations", "Exam Security", "Live Monitor"],
      },
    ];
  }

  if (role === "examination_officer") {
    return [
      ...commonIntro,
      {
        id: "start",
        title: "Officer dashboard",
        intro: "Approvals, live writers, integrity queue, and posts.",
        body: [
          "Your home shows pending examinations, integrity alerts, and shortcuts. Stat cards open Approvals, Live Monitor, Integrity, Post to students, and Results.",
        ],
        linkHints: ["Dashboard", "Approvals", "Live Monitor", "Integrity"],
      },
      {
        id: "approvals",
        title: "Examination approvals",
        intro: "Review teacher papers before students can sit them.",
        body: [
          "Awaiting decision lists papers in pending approval or changes requested. Check title, duration, questions to answer, and security summary.",
          "Approve, request changes, or reject with a note. After approval, use Post to students so the exam becomes visible to eligible students. Release (unpost) hides it again.",
        ],
        linkHints: ["Approvals", "Post to students"],
      },
      {
        id: "monitor",
        title: "Live monitoring",
        intro: "Camera, screen, identity, and actions.",
        body: [
          "Live Monitor lists in-progress attempts with student name, matric, course, exam, timer, questions answered, tab counts, face status, and feeds when publishing works.",
          "Actions such as warning, pause, resume, submit, hold, and terminate apply to that student’s real attempt through the session command channel.",
        ],
        linkHints: ["Live Monitor"],
        warnings: [
          "Only students actively writing appear as live. Counts on the dashboard should match active attempts.",
        ],
      },
      {
        id: "integrity",
        title: "Integrity review",
        intro: "Submitted attempts and event timelines.",
        body: [
          "Integrity Review lists submitted attempts for security review. Open an attempt to see integrity events. Accept, flag, further review, or cancel; accepting can release toward results workflows.",
          "Accepted items leave the active queue. Search by student or exam when the list is long.",
        ],
        linkHints: ["Integrity", "Results"],
      },
      {
        id: "results",
        title: "Results release",
        intro: "Control when students see scores.",
        body: [
          "Results tools let you release or hold outcomes. Students see clear status text when scores are not yet public.",
        ],
        linkHints: ["Results"],
      },
      {
        id: "reports",
        title: "Student reports",
        intro: "Messages from students about exams.",
        body: [
          "Student reports shows name, matric, exam, and message. Reply so the student sees your response under Contact officer.",
          "The navigation badge counts open (not yet replied) reports when data is available.",
        ],
        linkHints: ["Student reports"],
      },
      {
        id: "settings",
        title: "Settings and notifications",
        intro: "Officer account preferences.",
        body: [
          "Settings covers notifications, biometric unlock, appearance, and offline status. Use Notifications for approval and system alerts.",
        ],
        linkHints: ["Settings", "Notifications", "Profile"],
      },
      {
        id: "tips",
        title: "Quick reference",
        intro: "Officer checklist.",
        bullets: [
          "Approve → Post to students → students can start",
          "Live Monitor for camera/screen and pause/resume",
          "Integrity Review after scripts submit",
          "Release results when policy allows",
        ],
        body: ["Coordinate with teachers on security settings before high-stakes sittings."],
        linkHints: ["Approvals", "Live Monitor", "Integrity", "Results"],
      },
    ];
  }

  // school_admin
  return [
    ...commonIntro,
    {
      id: "start",
      title: "School Admin workspace",
      intro: "Users, structure, academics, and assessment oversight.",
      body: [
        "School Admin manages the institution record: users, students, teachers, departmental officers, faculties, departments, levels, courses, sessions, semesters, examinations overview, and results.",
      ],
      linkHints: ["Dashboard", "Students", "Teachers", "Courses"],
    },
    {
      id: "users",
      title: "People and roles",
      intro: "Provision the people who run exams.",
      body: [
        "Create and maintain students, teachers, and officers. Correct profile links (school, department, level) so dashboards and exam eligibility resolve.",
      ],
      linkHints: ["Students", "Teachers", "Officers"],
    },
    {
      id: "structure",
      title: "Academic structure",
      intro: "Faculties, departments, levels, sessions, courses.",
      body: [
        "Structure and related pages define how courses and students attach to the school calendar. Keep sessions and semesters current so examinations schedule cleanly.",
      ],
      linkHints: ["Structure", "Departments", "Levels", "Sessions", "Courses"],
    },
    {
      id: "exams",
      title: "Examinations and results",
      intro: "Oversight without replacing the officer workflow.",
      body: [
        "Administrators can view examinations and results for the school. Day-to-day approval, posting, and live invigilation remain with departmental officers and teachers as configured.",
      ],
      linkHints: ["Examinations", "Results"],
    },
    {
      id: "settings",
      title: "Settings and notifications",
      intro: "School admin account preferences.",
      body: [
        "Settings and Notifications work like other roles: preferences, security unlock options on supported devices, and in-app alerts.",
      ],
      linkHints: ["Settings", "Notifications", "Profile"],
    },
    {
      id: "tips",
      title: "Quick reference",
      intro: "Admin checklist.",
      bullets: [
        "Link every user to the correct school",
        "Keep departments, levels, and courses accurate",
        "Officers post exams; students only see posted papers",
        "Results release follows officer/teacher rules",
      ],
      body: ["Use Structure and Users before peak examination periods."],
      linkHints: ["Dashboard", "Students", "Examinations"],
    },
  ];
}

export function resolveManualRole(scope: string, sessionRole?: string | null): ManualRole {
  const s = `${scope} ${sessionRole || ""}`.toLowerCase();
  if (s.includes("super")) return "super_admin";
  if (s.includes("student")) return "student";
  if (s.includes("teacher")) return "teacher";
  if (s.includes("officer") || s.includes("examination")) return "examination_officer";
  if (s.includes("admin")) return "school_admin";
  return "student";
}

function RichParagraph({ text, routes }: { text: string; routes: RouteMap }) {
  const parts: ReactNode[] = [];
  const labels = Object.keys(routes).sort((a, b) => b.length - a.length);
  let remaining = text;
  let key = 0;
  while (remaining.length) {
    let hit: { label: string; at: number } | null = null;
    for (const label of labels) {
      const at = remaining.indexOf(label);
      if (at >= 0 && (hit == null || at < hit.at)) hit = { label, at };
    }
    if (!hit) {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }
    if (hit.at > 0) {
      parts.push(<span key={key++}>{remaining.slice(0, hit.at)}</span>);
    }
    const to = routes[hit.label];
    parts.push(
      <Link
        key={key++}
        to={to as never}
        className="font-semibold text-primary underline-offset-2 hover:underline"
        preload={false}
      >
        {hit.label}
      </Link>,
    );
    remaining = remaining.slice(hit.at + hit.label.length);
  }
  return <p className="text-sm leading-relaxed text-slate-700 sm:text-[0.9375rem]">{parts}</p>;
}

export function RoleManual({
  role,
  fullName,
}: {
  role: ManualRole;
  fullName?: string | null;
}) {
  const title = roleTitle(role);
  const routes = useMemo(() => routesFor(role), [role]);
  const sections = useMemo(() => sectionsFor(role), [role]);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<"next" | "prev" | "none">("none");
  const [query, setQuery] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const navLock = useRef(false);
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.intro.toLowerCase().includes(q) ||
        s.body.some((b) => b.toLowerCase().includes(q)) ||
        (s.bullets || []).some((b) => b.toLowerCase().includes(q)) ||
        (s.whatYouCanDo || []).some((b) => b.toLowerCase().includes(q)) ||
        (s.warnings || []).some((b) => b.toLowerCase().includes(q)),
    );
  }, [sections, query]);

  const total = filtered.length;
  const safeIndex = Math.min(index, Math.max(0, total - 1));
  const current = filtered[safeIndex] ?? filtered[0];
  const Icon = current ? sectionIcon(current.id) : BookOpen;

  useEffect(() => {
    setIndex(0);
  }, [query, role]);

  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }, [safeIndex, reduceMotion]);

  const go = useCallback(
    (next: number, d: "next" | "prev") => {
      if (navLock.current) return;
      if (next < 0 || next >= total) return;
      navLock.current = true;
      setDir(d);
      setIndex(next);
      window.setTimeout(() => {
        setDir("none");
        navLock.current = false;
      }, reduceMotion ? 0 : 280);
    },
    [total, reduceMotion],
  );

  if (role === "super_admin") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
        Manual Guide is not available for Super Admin accounts.
      </div>
    );
  }

  if (!current) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
        No manual sections match your search. Clear the search box to see all pages.
      </div>
    );
  }

  const isFirst = safeIndex <= 0;
  const isLast = safeIndex >= total - 1;
  const progress = total > 0 ? ((safeIndex + 1) / total) * 100 : 0;

  return (
    <div className="relative mx-auto flex w-full max-w-3xl flex-col gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="rounded-2xl border border-slate-200 bg-gradient-to-br from-[#0b1b3a] to-[#122548] px-4 py-4 text-white shadow-sm sm:px-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10">
            <BookOpen className="h-5 w-5 text-sky-200" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-200/90">
              D4EXAM Manual
            </p>
            <h2 className="truncate text-lg font-extrabold tracking-tight sm:text-xl">
              {fullName ? `Hello, ${fullName.split(" ")[0]}` : title}
            </h2>
            <p className="mt-0.5 text-xs text-slate-300">
              {title} guide · accurate to how the app works
            </p>
          </div>
        </div>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the manual…"
            className="h-10 w-full rounded-xl border-0 bg-white/10 pl-9 pr-3 text-sm text-white placeholder:text-slate-400 outline-none ring-1 ring-white/15 focus:ring-2 focus:ring-sky-400/50"
            aria-label="Search the manual"
          />
        </div>
      </header>

      <div className="flex items-center gap-2 px-0.5">
        <p className="text-xs font-bold text-slate-600">
          {safeIndex + 1} of {total}
        </p>
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="flex items-stretch gap-2">
        <button
          type="button"
          disabled={isFirst}
          onClick={() => go(safeIndex - 1, "prev")}
          aria-label="Previous manual page"
          className="hidden h-auto min-w-[2.75rem] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-800 shadow-sm disabled:opacity-40 sm:inline-flex"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div
          ref={panelRef}
          className={cn(
            "min-h-[min(28rem,60vh)] max-h-[min(36rem,70vh)] min-w-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-4 shadow-md sm:p-5",
            !reduceMotion && dir === "next" && "animate-in fade-in slide-in-from-right-2 duration-300",
            !reduceMotion && dir === "prev" && "animate-in fade-in slide-in-from-left-2 duration-300",
          )}
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                {title} · page {safeIndex + 1}
              </p>
              <h3 className="text-base font-extrabold text-slate-900 sm:text-lg">{current.title}</h3>
            </div>
          </div>
          <p className="mb-3 text-sm font-medium text-slate-600">{current.intro}</p>
          <div className="space-y-3">
            {current.body.map((para, i) => (
              <RichParagraph key={i} text={para} routes={routes} />
            ))}
          </div>
          {current.bullets && current.bullets.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Key points</p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
                {current.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ol>
            </div>
          ) : null}
          {current.whatYouCanDo && current.whatYouCanDo.length > 0 ? (
            <div className="mt-4 rounded-xl border border-sky-100 bg-sky-50/80 px-3 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-sky-800">What you can do</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-sky-950">
                {current.whatYouCanDo.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {current.warnings && current.warnings.length > 0 ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-900">Important</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-amber-950">
                {current.warnings.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {current.linkHints && current.linkHints.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
              {current.linkHints.map((label) => {
                const to = routes[label];
                if (!to) return null;
                return (
                  <Link
                    key={label}
                    to={to as never}
                    preload={false}
                    className="text-sm font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    Open {label} →
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          disabled={isLast}
          onClick={() => go(safeIndex + 1, "next")}
          aria-label="Next manual page"
          className="hidden h-auto min-w-[2.75rem] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-800 shadow-sm disabled:opacity-40 sm:inline-flex"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={isFirst}
          onClick={() => go(safeIndex - 1, "prev")}
          className="inline-flex h-11 flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-800 shadow-sm disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <button
          type="button"
          disabled={isLast}
          onClick={() => go(safeIndex + 1, "next")}
          className="inline-flex h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-primary text-sm font-bold text-white shadow-sm disabled:opacity-40"
        >
          {isLast ? "End" : "Next"} <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
