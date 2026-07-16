import { useMemo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type ActivityDay = {
  date: string; // yyyy-mm-dd
  count: number;
};

export function getActivityLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
}

const LEVEL_CLASS: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: "bg-muted/40 border-border/60",
  1: "bg-primary/20 border-primary/20",
  2: "bg-primary/40 border-primary/30",
  3: "bg-primary/70 border-primary/50",
  4: "bg-primary border-primary",
};

const MONTHS_PT = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function formatDatePt(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} de ${["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"][m - 1]} de ${y}`;
}

type Props = {
  days: ActivityDay[];
  unitLabel: string; // "eventos" | "movimentações"
  selectedDate?: string | null;
  onSelectDate?: (date: string | null) => void;
  loading?: boolean;
};

export function ActivityCalendar({ days, unitLabel, selectedDate, onSelectDate, loading }: Props) {
  const { weeks, total, monthLabels } = useMemo(() => {
    const total = days.reduce((s, d) => s + d.count, 0);

    // Align to weeks starting Sunday. First column may have leading empty cells.
    const first = days[0] ? new Date(days[0].date + "T00:00:00") : new Date();
    const leading = first.getDay(); // 0..6
    const cells: (ActivityDay | null)[] = [
      ...Array.from({ length: leading }, () => null),
      ...days,
    ];
    const weeks: (ActivityDay | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }

    const monthLabels: { col: number; label: string }[] = [];
    let lastMonth = -1;
    weeks.forEach((w, idx) => {
      const first = w.find((c) => c) as ActivityDay | undefined;
      if (!first) return;
      const m = new Date(first.date + "T00:00:00").getMonth();
      if (m !== lastMonth) {
        monthLabels.push({ col: idx, label: MONTHS_PT[m] });
        lastMonth = m;
      }
    });

    return { weeks, total, monthLabels };
  }, [days]);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h3 className="text-sm font-medium">Atividade do sistema</h3>
        <span className="text-xs text-muted-foreground">
          {loading ? "Carregando…" : `${total.toLocaleString("pt-BR")} ${unitLabel} nos últimos 12 meses`}
        </span>
      </div>

      <div className="overflow-x-auto">
        <TooltipProvider delayDuration={100}>
          <div className="inline-block min-w-full">
            <div className="flex gap-[3px] pl-6 text-[10px] text-muted-foreground">
              {weeks.map((_, i) => {
                const lab = monthLabels.find((m) => m.col === i);
                return (
                  <div key={i} className="w-[11px] text-left">
                    {lab?.label ?? ""}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-[3px]">
              <div className="flex flex-col justify-between py-[2px] pr-1 text-[10px] text-muted-foreground">
                <span>seg</span>
                <span>qua</span>
                <span>sex</span>
              </div>
              {weeks.map((week, i) => (
                <div key={i} className="flex flex-col gap-[3px]">
                  {Array.from({ length: 7 }).map((_, j) => {
                    const cell = week[j];
                    if (!cell) return <div key={j} className="h-[11px] w-[11px]" />;
                    const level = getActivityLevel(cell.count);
                    const isSelected = selectedDate === cell.date;
                    const label = `${formatDatePt(cell.date)}: ${cell.count} ${unitLabel}`;
                    return (
                      <Tooltip key={j}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label={label}
                            onClick={() => onSelectDate?.(isSelected ? null : cell.date)}
                            className={`h-[11px] w-[11px] rounded-[2px] border transition ${LEVEL_CLASS[level]} ${
                              isSelected ? "ring-2 ring-primary ring-offset-1 ring-offset-card" : ""
                            }`}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          {cell.count} {unitLabel} em {formatDatePt(cell.date)}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </TooltipProvider>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2 text-[10px] text-muted-foreground">
        <span>Menos</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`h-[11px] w-[11px] rounded-[2px] border ${LEVEL_CLASS[l as 0]}`} />
        ))}
        <span>Mais</span>
      </div>
    </div>
  );
}
