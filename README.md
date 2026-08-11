# D4EXAM Platform

D4EXAM — PHASE 1: COMPLETE UI/UX & FRONTEND



Build Phase 1 of D4EXAM, a professional worldwide online examination/CBT platform for schools.



I will provide two reference assets with this prompt:



1. Website UI reference image — use this ONLY as the visual/layout reference.

2. D4EXAM logo — use the provided logo as the official brand logo.



IMPORTANT — REFERENCE IMAGE



Follow the design pattern of the reference image very closely.



Study and reproduce its:



- Overall layout structure

- Desktop composition

- Mobile composition

- Sidebar/navigation pattern

- Header structure

- Card placement

- Spacing

- Typography hierarchy

- Button positioning

- Content density

- Page proportions

- Responsive behavior

- Professional visual balance



Do NOT place the reference image itself anywhere on the website.



Do NOT make the website look like a picture/mockup.



The reference image is only a design blueprint. Recreate the interface as a real responsive website using HTML/CSS/React components.



Use the uploaded D4EXAM logo exactly as the official logo. Do not create a different logo.



---



DESIGN STYLE



D4EXAM must look:



- Professional

- Academic

- Modern

- Clean

- Minimal

- Trustworthy

- Institutional

- Production-ready



Avoid:



- Excessive animations

- Gaming-style designs

- Neon/cyberpunk styling

- Excessive gradients

- Excessive glassmorphism

- Unnecessary illustrations

- Clutter

- Distracting decorative elements



The website should feel like a serious university/school examination system.



---



BRAND COLORS



Primary Green:

"#22C58B"



Aqua:

"#4DD8CF"



Glow:

"#2ED7C4"



Dark Background:

"#070D1B"



Surface:

"#0D1628"



Primary Text:

"#F5F7FA"



Secondary Text:

"#94A3B8"



Muted Text:

"#64748B"



Use subtle borders and professional success/warning/error colors.



Typography:



Syne — headings

Inter — body/UI



Keep typography consistent throughout the application.



---



PHASE 1 SCOPE



Phase 1 is the complete frontend/UI/UX foundation only.



Do NOT implement real:



- Authentication

- Database operations

- Supabase RLS

- Payment systems

- Real examination processing

- Real result calculations

- Production security logic



Use realistic mock data and frontend state.



Prepare the architecture so the real backend can be connected in Phase 2 without redesigning the UI.



---



PUBLIC PAGES



Create:



- Homepage

- Features

- About

- School Application

- Application Status

- Login

- Forgot Password

- Reset Password

- Support

- Privacy



Homepage



Include:



- D4EXAM logo

- Professional navigation

- Hero section

- Online examination/CBT messaging

- Get Started

- School Login

- Features

- How D4EXAM Works

- Security section

- Role overview

- Call-to-action

- Footer



Keep it clean and professional.



---



LOGIN



Use ONE unified login page.



Do NOT display:



- Login as Student

- Login as Teacher

- Login as Admin



Show:



- School/Institution Code

- Student ID / Matric Number / Staff ID / Email

- Password

- Remember Me

- Forgot Password

- Login



The real system will automatically identify the user's role in Phase 2.



For Phase 1, use mock navigation only.



Create both desktop and mobile versions.



---



STUDENT UI



Create every student page:



- Dashboard

- Examinations

- Exam Details

- Security Check

- CBT Examination

- Examination Submitted

- Results

- Result Details

- Courses

- Notifications

- Profile

- Settings



Student Dashboard



Show:



- Student name

- Matric number

- Department

- Level

- School

- Upcoming examinations

- Completed examinations

- Results

- Courses

- Notifications



CBT EXAMINATION SCREEN



This must be extremely professional and distraction-free.



Show:



- D4EXAM logo

- Exam/course title

- Question number

- Timer

- Question text

- Answer options

- Previous/Next

- Question navigator

- Answered/unanswered/flagged states

- Flag question

- Connection status

- Submit Examination



Do NOT show normal dashboard navigation during the exam.



Create desktop and mobile CBT layouts.



Include mock states for:



- Normal

- Answered

- Flagged

- Unanswered

- Timer warning

- Connection warning

- Submission confirmation



---



TEACHER UI



Create:



- Dashboard

- Courses

- Course Details

- Question Bank

- Create Question

- Edit Question

- Examinations

- Create Examination

- Exam Management

- Exam Security

- Submissions

- Integrity Monitoring

- Marking Center

- Results

- Live Exams

- Notifications

- Profile

- Settings



Examination Builder



Create a professional multi-step interface:



1. Basic Information

2. Questions

3. Marks

4. Schedule

5. Security

6. Result Settings

7. Preview

8. Submit



Security settings should visually include:



- Fullscreen

- Tab Monitoring

- Maximum Tab Switches

- Copy/Paste restriction

- Question Randomization

- Option Randomization

- Camera

- Microphone

- Action when cheating threshold is reached



---



SCHOOL ADMIN UI



Create:



- Dashboard

- Users

- Students

- Student Import

- Teachers

- Faculties

- Departments

- Levels

- Courses

- Academic Sessions

- Semesters

- Examinations

- Results

- Reports

- Notifications

- Profile

- Settings



Student Import



Create a professional upload workflow:



Upload CSV/Excel

→ Preview

→ Validate

→ Show valid/error records

→ Import



Include:



- Download Template

- Search

- Filters

- Student table

- Status badges

- Add Student

- Edit Student

- Deactivate Student



---



EXAMINATION OFFICER UI



Create:



- Dashboard

- Examination Approvals

- Live Monitor

- Integrity Review

- Results

- Reports

- Audit Logs

- Notifications

- Settings



Include:



- Pending approvals

- Active examinations

- Live candidates

- Flagged attempts

- Result approval

- Integrity event timeline



---



SUPER ADMIN UI



Create:



- Dashboard

- Schools

- School Applications

- School Details

- Platform Users

- Examinations

- Subscriptions

- Reports

- Platform Settings

- Audit Logs

- Notifications

- Profile



Super Admin controls the entire D4EXAM platform.



Regular students, teachers and school administrators must never see Super Admin navigation.



---



RESPONSIVE DESIGN



Every page must be intentionally designed for:



- Desktop

- Laptop

- Tablet

- Mobile



Do NOT simply shrink desktop pages.



Desktop:



Sidebar + Header + Main Content



Mobile:



Compact Header + Drawer/Bottom Navigation + Main Content



Student mobile bottom navigation:



Home

Exams

Results

Profile



Make the CBT interface especially optimized for mobile.



No horizontal scrolling on normal pages.



---



COMPONENT SYSTEM



Create reusable components for:



- Buttons

- Inputs

- Selects

- Cards

- Tables

- Tabs

- Modals

- Drawers

- Dropdowns

- Badges

- Alerts

- Toasts

- Search

- Filters

- Pagination

- Charts

- Avatars

- Status indicators

- Skeleton loaders

- Empty states

- Error states

- Confirmation dialogs



Use one consistent design system across every role.



---



ROUTING



Create all required routes for:



Public

Student

Teacher

School Admin

Examination Officer

Super Admin



Use clean role-based layouts:



"PublicLayout"

"StudentLayout"

"TeacherLayout"

"AdminLayout"

"OfficerLayout"

"SuperAdminLayout"

"ExamLayout"



---



FILE STRUCTURE



Organize the project professionally:



src/

  components/

    ui/

    layout/

    navigation/

    dashboard/

    examination/

    forms/

    tables/

    charts/

    notifications/



  layouts/

    PublicLayout

    StudentLayout

    TeacherLayout

    AdminLayout

    OfficerLayout

    SuperAdminLayout

    ExamLayout



  pages/

    public/

    student/

    teacher/

    admin/

    officer/

    super-admin/



  data/

    mock/



  routes/

  hooks/

  lib/

  types/

  assets/

  styles/



Keep components modular and reusable.



---



UI STATES



Every important page must have:



- Loading state

- Skeleton state

- Empty state

- Error state

- Success state

- Disabled state

- Confirmation state



Use realistic academic mock data.



Do NOT use Lorem Ipsum.



---



ACCESSIBILITY



Include:



- Good contrast

- Keyboard navigation

- Visible focus states

- Accessible labels

- Large mobile touch targets

- Clear validation messages



---



ANIMATION



Use only subtle animations:



- Hover

- Dropdown

- Modal

- Page transition

- Loading



No distracting animations.



The examination interface must remain completely focused.



---



FINAL REQUIREMENT



Do not consider Phase 1 complete until the entire D4EXAM frontend has been created.



Every required page must exist.



Every role must have a complete dashboard.



Every page must have desktop and mobile layouts.



The homepage, login, student dashboard, teacher dashboard, school admin dashboard, examination officer dashboard, Super Admin dashboard and CBT examination interface must all feel like parts of the SAME professional D4EXAM product.



The final result should look like a real production-ready university/school examination platform, not a prototype.



Do NOT start Phase 2.



Do NOT build the real backend yet.



Finish the complete visual/frontend system first.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/11543735-4ab6-41ce-8fef-68d505bdee4e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
