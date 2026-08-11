import type {
  Exam,
  NotificationItem,
  Question,
  ResultRecord,
  Student,
} from "@/types";

export const currentStudent = {
  name: "Destiny Amurun",
  matric: "CSC/2021/0184",
  email: "destiny.amurun@examplestate.edu.ng",
  department: "Computer Engineering",
  faculty: "Faculty of Engineering",
  level: "300 Level",
  school: "Example State University",
  session: "2025/2026",
  semester: "First Semester",
  avatar: "DA",
};

export const currentTeacher = {
  name: "Dr. John Doe",
  staffId: "STF/ENG/0342",
  department: "Computer Engineering",
  school: "Example State University",
  avatar: "JD",
};

export const currentAdmin = {
  name: "Grace Okonkwo",
  staffId: "ADM/0007",
  role: "School Administrator",
  school: "Example State University",
  avatar: "GO",
};

export const currentOfficer = {
  name: "Prof. Samuel Adeyemi",
  staffId: "EXO/0021",
  role: "Examination Officer",
  school: "Example State University",
  avatar: "SA",
};

export const currentSuperAdmin = {
  name: "Platform Operations",
  staffId: "D4-ROOT-01",
  role: "Super Administrator",
  school: "D4EXAM Platform",
  avatar: "D4",
};

export const studentExams: Exam[] = [
  {
    id: "e1",
    code: "CSC101",
    title: "First Semester Examination",
    course: "Introduction to Computer Science",
    date: "Tomorrow · 10:00 AM",
    duration: 60,
    questions: 50,
    status: "scheduled",
  },
  {
    id: "e2",
    code: "MTH301",
    title: "Continuous Assessment",
    course: "Numerical Analysis",
    date: "Today · 2:00 PM",
    duration: 45,
    questions: 40,
    status: "ongoing",
  },
  {
    id: "e3",
    code: "PHY301",
    title: "Mid Semester Test",
    course: "Electromagnetic Fields",
    date: "Aug 28, 2026 · 9:00 AM",
    duration: 90,
    questions: 60,
    status: "scheduled",
  },
  {
    id: "e4",
    code: "EEE301",
    title: "First Semester Examination",
    course: "Digital Electronics",
    date: "Aug 12, 2026 · 11:00 AM",
    duration: 60,
    questions: 50,
    status: "completed",
  },
];

export const studentResults: ResultRecord[] = [
  {
    id: "r1",
    course: "CSC101",
    title: "Introduction to Computer Science",
    score: 84,
    grade: "A",
    status: "published",
    session: "2025/2026",
  },
  {
    id: "r2",
    course: "MTH301",
    title: "Numerical Analysis",
    score: 78,
    grade: "B",
    status: "published",
    session: "2025/2026",
  },
  {
    id: "r3",
    course: "PHY301",
    title: "Electromagnetic Fields",
    score: 92,
    grade: "A",
    status: "published",
    session: "2025/2026",
  },
  {
    id: "r4",
    course: "EEE301",
    title: "Digital Electronics",
    score: 68,
    grade: "C",
    status: "pending",
    session: "2025/2026",
  },
];

export const studentCourses = [
  { code: "CSC101", title: "Introduction to Computer Science", units: 3, lecturer: "Dr. John Doe" },
  { code: "MTH301", title: "Numerical Analysis", units: 3, lecturer: "Dr. Amina Bello" },
  { code: "PHY301", title: "Electromagnetic Fields", units: 2, lecturer: "Prof. K. Nwosu" },
  { code: "EEE301", title: "Digital Electronics", units: 3, lecturer: "Engr. Peter Musa" },
  { code: "GST301", title: "Entrepreneurship Studies", units: 2, lecturer: "Mrs. F. Adebayo" },
  { code: "CSC305", title: "Operating Systems", units: 3, lecturer: "Dr. Chidi Eze" },
];

export const notifications: NotificationItem[] = [
  {
    id: "n1",
    title: "CSC101 examination starts tomorrow",
    body: "Your First Semester Examination for CSC101 begins at 10:00 AM. Run a security check before you start.",
    time: "12 minutes ago",
    type: "info",
    read: false,
  },
  {
    id: "n2",
    title: "PHY301 result published",
    body: "Your Electromagnetic Fields result has been approved and published by the examination officer.",
    time: "3 hours ago",
    type: "success",
    read: false,
  },
  {
    id: "n3",
    title: "Course registration closes Friday",
    body: "Complete your 2025/2026 first semester course registration before 11:59 PM on Friday.",
    time: "Yesterday",
    type: "warning",
    read: true,
  },
  {
    id: "n4",
    title: "Unstable connection detected",
    body: "Your last attempt recorded 2 reconnection events. Use a stable network for upcoming examinations.",
    time: "2 days ago",
    type: "error",
    read: true,
  },
];

export const examQuestions: Question[] = [
  {
    id: "q1",
    text: "What is a variable in programming?",
    options: [
      "A fixed value that cannot change during execution",
      "A named storage location that holds a value",
      "An operating system service",
      "A network transmission protocol",
    ],
    answer: 1,
    type: "MCQ",
    marks: 2,
    topic: "Fundamentals",
    difficulty: "Easy",
  },
  {
    id: "q2",
    text: "Which data structure uses First In, First Out (FIFO) ordering?",
    options: ["Stack", "Queue", "Binary tree", "Hash table"],
    answer: 1,
    type: "MCQ",
    marks: 2,
    topic: "Data Structures",
    difficulty: "Easy",
  },
  {
    id: "q3",
    text: "In Big-O notation, what is the average time complexity of binary search?",
    options: ["O(n)", "O(n log n)", "O(log n)", "O(1)"],
    answer: 2,
    type: "MCQ",
    marks: 3,
    topic: "Algorithms",
    difficulty: "Medium",
  },
  {
    id: "q4",
    text: "Which of the following is NOT a valid primitive type in most C-like languages?",
    options: ["int", "float", "char", "record"],
    answer: 3,
    type: "MCQ",
    marks: 2,
    topic: "Fundamentals",
    difficulty: "Easy",
  },
  {
    id: "q5",
    text: "A compiler translates source code into machine code before execution.",
    options: ["True", "False"],
    answer: 0,
    type: "True/False",
    marks: 1,
    topic: "Compilers",
    difficulty: "Easy",
  },
  {
    id: "q6",
    text: "Which memory area stores local variables during a function call?",
    options: ["Heap", "Stack", "Registers only", "Disk cache"],
    answer: 1,
    type: "MCQ",
    marks: 3,
    topic: "Operating Systems",
    difficulty: "Medium",
  },
  {
    id: "q7",
    text: "What does SQL stand for?",
    options: [
      "Structured Query Language",
      "Sequential Query Logic",
      "System Quality Layer",
      "Standard Queue Language",
    ],
    answer: 0,
    type: "MCQ",
    marks: 1,
    topic: "Databases",
    difficulty: "Easy",
  },
  {
    id: "q8",
    text: "Normalisation in relational databases primarily aims to reduce which problem?",
    options: ["Query speed", "Data redundancy", "Disk encryption", "Index fragmentation"],
    answer: 1,
    type: "MCQ",
    marks: 3,
    topic: "Databases",
    difficulty: "Medium",
  },
  {
    id: "q9",
    text: "Which protocol is used to securely transfer web pages?",
    options: ["FTP", "HTTP", "HTTPS", "SMTP"],
    answer: 2,
    type: "MCQ",
    marks: 2,
    topic: "Networking",
    difficulty: "Easy",
  },
  {
    id: "q10",
    text: "Recursion always performs better than iteration for the same problem.",
    options: ["True", "False"],
    answer: 1,
    type: "True/False",
    marks: 1,
    topic: "Algorithms",
    difficulty: "Medium",
  },
];

export const questionBank: Question[] = examQuestions;

export const students: Student[] = [
  {
    id: "s1",
    name: "Destiny Amurun",
    matric: "CSC/2021/0184",
    email: "destiny.amurun@examplestate.edu.ng",
    department: "Computer Engineering",
    level: "300",
    status: "active",
  },
  {
    id: "s2",
    name: "Aisha Mohammed",
    matric: "CSC/2021/0102",
    email: "aisha.mohammed@examplestate.edu.ng",
    department: "Computer Science",
    level: "300",
    status: "active",
  },
  {
    id: "s3",
    name: "Emeka Obi",
    matric: "EEE/2020/0455",
    email: "emeka.obi@examplestate.edu.ng",
    department: "Electrical Engineering",
    level: "400",
    status: "active",
  },
  {
    id: "s4",
    name: "Fatima Yusuf",
    matric: "MTH/2022/0231",
    email: "fatima.yusuf@examplestate.edu.ng",
    department: "Mathematics",
    level: "200",
    status: "pending",
  },
  {
    id: "s5",
    name: "Tunde Bakare",
    matric: "PHY/2019/0078",
    email: "tunde.bakare@examplestate.edu.ng",
    department: "Physics",
    level: "500",
    status: "inactive",
  },
  {
    id: "s6",
    name: "Chiamaka Nwankwo",
    matric: "CSC/2022/0311",
    email: "chiamaka.nwankwo@examplestate.edu.ng",
    department: "Computer Science",
    level: "200",
    status: "active",
  },
  {
    id: "s7",
    name: "Ibrahim Sule",
    matric: "EEE/2021/0190",
    email: "ibrahim.sule@examplestate.edu.ng",
    department: "Electrical Engineering",
    level: "300",
    status: "active",
  },
  {
    id: "s8",
    name: "Ngozi Eze",
    matric: "BIO/2023/0044",
    email: "ngozi.eze@examplestate.edu.ng",
    department: "Biology",
    level: "100",
    status: "active",
  },
];

export const teachers = [
  { id: "t1", name: "Dr. John Doe", staffId: "STF/ENG/0342", department: "Computer Engineering", courses: 4, status: "active" },
  { id: "t2", name: "Dr. Amina Bello", staffId: "STF/SCI/0121", department: "Mathematics", courses: 3, status: "active" },
  { id: "t3", name: "Prof. K. Nwosu", staffId: "STF/SCI/0033", department: "Physics", courses: 2, status: "active" },
  { id: "t4", name: "Engr. Peter Musa", staffId: "STF/ENG/0410", department: "Electrical Engineering", courses: 5, status: "active" },
  { id: "t5", name: "Mrs. F. Adebayo", staffId: "STF/GST/0009", department: "General Studies", courses: 2, status: "inactive" },
];

export const faculties = [
  { id: "f1", name: "Faculty of Engineering", dean: "Prof. K. Nwosu", departments: 6, students: 3120 },
  { id: "f2", name: "Faculty of Science", dean: "Prof. A. Ibrahim", departments: 8, students: 4210 },
  { id: "f3", name: "Faculty of Social Sciences", dean: "Dr. M. Ojo", departments: 5, students: 2870 },
  { id: "f4", name: "Faculty of Law", dean: "Prof. B. Danjuma", departments: 3, students: 980 },
];

export const departments = [
  { id: "d1", name: "Computer Engineering", faculty: "Faculty of Engineering", hod: "Dr. John Doe", students: 640 },
  { id: "d2", name: "Electrical Engineering", faculty: "Faculty of Engineering", hod: "Engr. Peter Musa", students: 720 },
  { id: "d3", name: "Computer Science", faculty: "Faculty of Science", hod: "Dr. Chidi Eze", students: 890 },
  { id: "d4", name: "Mathematics", faculty: "Faculty of Science", hod: "Dr. Amina Bello", students: 410 },
];

export const schools = [
  { id: "sc1", name: "Example State University", code: "ESU", country: "Nigeria", students: 12480, plan: "Enterprise", status: "active" },
  { id: "sc2", name: "Government College Kaduna", code: "GCK", country: "Nigeria", students: 2140, plan: "Standard", status: "active" },
  { id: "sc3", name: "City Polytechnic", code: "CPT", country: "Ghana", students: 5320, plan: "Standard", status: "active" },
  { id: "sc4", name: "Cambridge Heights Academy", code: "CHA", country: "United Kingdom", students: 890, plan: "Starter", status: "trial" },
  { id: "sc5", name: "Nairobi Institute of Technology", code: "NIT", country: "Kenya", students: 3410, plan: "Standard", status: "suspended" },
];

export const schoolApplications = [
  { id: "a1", name: "Lagos Model College", country: "Nigeria", contact: "principal@lagosmodel.edu.ng", date: "Aug 13, 2026", status: "pending" },
  { id: "a2", name: "Accra Grammar School", country: "Ghana", contact: "admin@accragrammar.edu.gh", date: "Aug 11, 2026", status: "under review" },
  { id: "a3", name: "Kampala Science Academy", country: "Uganda", contact: "info@ksa.ac.ug", date: "Aug 9, 2026", status: "approved" },
  { id: "a4", name: "Dar Business Institute", country: "Tanzania", contact: "registry@dbi.ac.tz", date: "Aug 7, 2026", status: "rejected" },
];

export const integrityEvents = [
  { id: "i1", student: "Emeka Obi", matric: "EEE/2020/0455", event: "Tab switch detected", severity: "high", time: "10:24:11", exam: "CSC101" },
  { id: "i2", student: "Aisha Mohammed", matric: "CSC/2021/0102", event: "Exited fullscreen", severity: "medium", time: "10:22:47", exam: "CSC101" },
  { id: "i3", student: "Fatima Yusuf", matric: "MTH/2022/0231", event: "Copy attempt blocked", severity: "low", time: "10:19:02", exam: "MTH301" },
  { id: "i4", student: "Ibrahim Sule", matric: "EEE/2021/0190", event: "Connection lost 38s", severity: "medium", time: "10:15:33", exam: "MTH301" },
  { id: "i5", student: "Tunde Bakare", matric: "PHY/2019/0078", event: "Multiple faces detected", severity: "high", time: "10:11:58", exam: "PHY301" },
];

export const auditLogs = [
  { id: "l1", actor: "Grace Okonkwo", action: "Published CSC101 results", target: "CSC101", time: "Aug 11, 2026 · 14:22", ip: "102.89.34.11" },
  { id: "l2", actor: "Dr. John Doe", action: "Created examination", target: "CSC101 First Semester", time: "Aug 11, 2026 · 09:04", ip: "102.89.34.87" },
  { id: "l3", actor: "Prof. Samuel Adeyemi", action: "Approved examination", target: "MTH301 CA", time: "Aug 10, 2026 · 16:41", ip: "197.210.77.4" },
  { id: "l4", actor: "Platform Operations", action: "Suspended school account", target: "Nairobi Institute of Technology", time: "Aug 9, 2026 · 11:07", ip: "41.75.88.20" },
  { id: "l5", actor: "Grace Okonkwo", action: "Imported 420 student records", target: "students-2026.csv", time: "Aug 8, 2026 · 08:15", ip: "102.89.34.11" },
];

export const submissions = [
  { id: "sb1", student: "Destiny Amurun", matric: "CSC/2021/0184", exam: "CSC101", submitted: "10:58 AM", objective: 42, theory: "Pending", status: "awaiting marking" },
  { id: "sb2", student: "Aisha Mohammed", matric: "CSC/2021/0102", exam: "CSC101", submitted: "10:54 AM", objective: 46, theory: "18/20", status: "marked" },
  { id: "sb3", student: "Emeka Obi", matric: "EEE/2020/0455", exam: "CSC101", submitted: "10:59 AM", objective: 31, theory: "Pending", status: "flagged" },
  { id: "sb4", student: "Chiamaka Nwankwo", matric: "CSC/2022/0311", exam: "CSC101", submitted: "10:47 AM", objective: 44, theory: "16/20", status: "marked" },
];

export const activityTrend = [
  { day: "Aug 6", exams: 320, students: 4210 },
  { day: "Aug 7", exams: 410, students: 5120 },
  { day: "Aug 8", exams: 380, students: 4880 },
  { day: "Aug 9", exams: 520, students: 6340 },
  { day: "Aug 10", exams: 610, students: 7120 },
  { day: "Aug 11", exams: 720, students: 8450 },
  { day: "Aug 12", exams: 690, students: 8120 },
];

export const gradeDistribution = [
  { grade: "A", count: 128 },
  { grade: "B", count: 214 },
  { grade: "C", count: 176 },
  { grade: "D", count: 84 },
  { grade: "F", count: 32 },
];
