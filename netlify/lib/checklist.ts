// Mirrors the "which tasks are due today" rules in public/app.js.
type Task = { id: string; days?: number[] };
type State = { tasks?: Task[]; days?: Record<string, string[]> };

export function tasksLeft(state: State, dateKey: string, weekday: number): number {
  const done = state.days?.[dateKey] ?? [];
  const due = (state.tasks ?? []).filter((t) => !t.days || t.days.includes(weekday));
  return due.filter((t) => !done.includes(t.id)).length;
}

// Local date key (YYYY-MM-DD), weekday (0 = Sunday) and minutes past midnight in a time zone.
export function localNow(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: weekdays.indexOf(get("weekday")),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}
