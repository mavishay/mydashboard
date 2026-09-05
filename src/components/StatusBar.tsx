interface StatusBarProps {
  services: Array<{ id: string; name: string; status: string }>;
  onClick: () => void;
  dndEnabled: boolean;
  cronStatus?: {
    enabled: boolean;
    lastMode: "work_hours" | "off_hours" | null;
    config: { workIntervalSeconds: number; offHoursIntervalSeconds: number };
  } | null;
}

function getCronLabel(cronStatus: StatusBarProps["cronStatus"]): string | null {
  if (!cronStatus?.enabled) return null;
  const mode = cronStatus.lastMode ?? "work_hours";
  const intervalSeconds =
    mode === "work_hours"
      ? cronStatus.config.workIntervalSeconds
      : cronStatus.config.offHoursIntervalSeconds;
  const minutes = Math.round(intervalSeconds / 60);
  const modeLabel = mode === "work_hours" ? "Work" : "Off";
  return `Cron: ${modeLabel} ${minutes < 60 ? `${minutes}m` : `${minutes / 60}h`}`;
}

export function StatusBar({
  services,
  onClick,
  dndEnabled,
  cronStatus,
}: StatusBarProps) {
  const cronLabel = getCronLabel(cronStatus);

  const runningCount = services.filter((s) => s.status === "running").length;
  const hasErrors = services.some((s) => s.status === "error");
  const statusColor = hasErrors
    ? "#ef4444"
    : runningCount > 0
      ? "#22c55e"
      : "#9ca3af";
  const statusLabel = `${runningCount}/${services.length} services`;

  return (
    <button onClick={onClick} className="cursor-pointer">
      <span
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: statusColor,
          display: "inline-block",
        }}
      />
    </button>
  );
}
