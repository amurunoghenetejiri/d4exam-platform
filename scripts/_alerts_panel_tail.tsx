        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-1.5 pb-1.5 pt-8 sm:px-2 sm:pb-2">
          <div className="mb-1 flex items-center justify-between gap-0.5">
            <FaceChip presence={presence} sev={sev} isDone={isDone} statusLabel={statusLabel} />
            {!isDone && (
              <span className="shrink-0 rounded bg-black/50 px-1 py-0.5 font-mono text-[9px] font-semibold text-white sm:px-1.5 sm:text-[10px]">
                {formatDuration(presence.timeRemainingSec)}
              </span>
            )}
          </div>
          <p className="truncate text-[11px] font-extrabold leading-tight text-white drop-shadow sm:text-xs">{name}</p>
          <p className="truncate text-[9px] font-medium leading-tight text-white/85 sm:text-[10px]">{matric}</p>
          <p className="truncate text-[9px] leading-tight text-white/65 sm:text-[10px]">{course}</p>
        </div>
      </div>
    </button>
  );
}

function AlertsPanel({
  alerts,
  readIds,
  studentNameById,
  onOpen,
  onMarkAll,
}: {
  alerts: IntegrityEvent[];
  readIds: Set<string>;
  studentNameById: Map<string, { name: string; matric: string }>;
  onOpen: (studentId: string | null) => void;
  onMarkAll: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm sm:rounded-2xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <h3 className="text-sm font-extrabold text-slate-900">
          Alerts <span className="text-slate-400">({alerts.length})</span>
        </h3>
        <button type="button" onClick={onMarkAll} className="text-[11px] font-semibold text-primary hover:underline">
          Mark all read
        </button>
      </div>
      <ul className="max-h-[22rem] divide-y divide-slate-50 overflow-y-auto sm:max-h-[28rem]">
        {alerts.length === 0 ? (
          <li className="p-4 text-center text-xs text-slate-500">No recent alerts</li>
        ) : (
          alerts.map((ev) => {
            const who = ev.student_id ? studentNameById.get(ev.student_id) : null;
            const high = ev.severity === "high";
            const med = ev.severity === "medium";
            return (
              <li key={ev.id}>
                <button
                  type="button"
                  onClick={() => onOpen(ev.student_id)}
                  className={cn(
                    "flex w-full gap-2 px-3 py-2 text-left transition hover:bg-slate-50",
                    !readIds.has(ev.id) && "bg-slate-50/50",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full",
                      high ? "bg-red-100 text-red-600" : med ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {high ? <ShieldAlert className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-slate-900">{who?.name ?? "Student"}</p>
                    <p
                      className={cn(
                        "truncate text-[11px] font-semibold",
                        high ? "text-red-600" : med ? "text-amber-700" : "text-slate-600",
                      )}
                    >
                      {humanEventLabel(ev.event_type, ev.description)}
                    </p>
                    <p className="text-[10px] text-slate-400">{relativeTime(ev.created_at)}</p>
                  </div>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

