import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, CalendarDays } from "lucide-react";
// TEST_PARTIAL - full restore next
export const Route = createFileRoute("/student/examinations")({ component: () => null });
