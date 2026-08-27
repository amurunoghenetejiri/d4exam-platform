{/* Feed mode + dual pane */}
            <div className="shrink-0 border-b border-slate-100 px-3 py-2 sm:px-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Feed</span>
                {([
                  ["camera", "Camera"],
                  ["screen", "Screen"],
                  ["both", "Both"],
                ] as const).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFeedMode(k)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[10px] font-bold transition",
                      feedMode === k ? "bg-primary text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                    )}
                  >
                    {label}
                  </button>
                ))}
                <span className="ml-auto truncate text-[10px] font-semibold text-slate-500">
                  {selected.course} · {selected.title}
                </span>
              </div>
            </div>
            {(() => {
              const camSrc = selected.frame?.src;
              const camLive = selected.videoStatus === "live" && Boolean(camSrc);
              const sf = screenFrames[selected.a.id] || screenFrames[`student:${selected.a.student_id}`];
              const scrLive = Boolean(sf && isLiveScreenFrameFresh(sf.ts));
              const showCam = feedMode === "camera" || feedMode === "both";
              const showScr = feedMode === "screen" || feedMode === "both";
              const dual = showCam && showScr;
              return (
                <div
                  className={cn(
                    "shrink-0 gap-1.5 bg-slate-100 p-1.5 sm:gap-2 sm:p-2",
                    dual ? "grid grid-cols-1 sm:grid-cols-2" : "grid grid-cols-1",
                  )}
                >
                  {showCam && (
                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-900 shadow-inner ring-1 ring-black/10">
                      {camLive && camSrc ? (
                        <img src={camSrc} alt={`${selected.name} camera`} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-1.5 px-3 text-center text-white/70">
                          {selected.isDone ? (
                            <CheckCircle2 className="h-10 w-10 text-emerald-400/80" />
                          ) : (
                            <CameraOff className="h-10 w-10 opacity-40" />
                          )}
                          <p className="text-xs font-semibold text-white/90">
                            {selected.isDone ? doneStatusLabel(selected.a.status) : "Camera offline"}
                          </p>
                        </div>
                      )}
                      <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                        <span className={cn("h-1.5 w-1.5 rounded-full", camLive ? "animate-pulse bg-red-500" : "bg-slate-400")} />
                        Camera
                      </div>
                      {camLive && (
                        <div className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-1 backdrop-blur-sm">
                          <SignalBars bars={selected.bars} />
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-6">
                        <p className="truncate text-xs font-extrabold text-white">{selected.name}</p>
                        <p className="truncate text-[10px] text-white/80">{selected.matric}</p>
                      </div>
                    </div>
                  )}
                  {showScr && (
                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-950 shadow-inner ring-1 ring-black/10">
                      {scrLive && sf ? (
                        <img src={sf.src} alt={`${selected.name} screen`} className="h-full w-full object-contain bg-black" />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-1.5 px-4 text-center text-white/60">
                          <Monitor className="h-10 w-10 opacity-30" />
                          <p className="text-xs font-semibold text-white/80">Screen not shared</p>
                          <p className="text-[10px] text-white/50">Appears when the student shares their screen</p>
                        </div>
                      )}
                      <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                        <span className={cn("h-1.5 w-1.5 rounded-full", scrLive ? "animate-pulse bg-emerald-400" : "bg-slate-400")} />
                        Screen {scrLive ? "· Live" : ""}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
