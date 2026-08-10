import { useState } from "react";
import {
  BookOpenText,
  ChevronRight,
  Home,
  ListTodo,
  Menu,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type NavItem = {
  key: string;
  label: string;
  description: string;
  to: string;
  icon: typeof Home;
};

type MobileNovelWorkspaceNavMenuProps = {
  novelId: string;
  novelTitle: string;
  directorTaskId?: string | null;
  onOpenTaskDrawer?: () => void;
};

export default function MobileNovelWorkspaceNavMenu({
  novelId,
  novelTitle,
  directorTaskId,
  onOpenTaskDrawer,
}: MobileNovelWorkspaceNavMenuProps) {
  const [open, setOpen] = useState(false);

  const items: NavItem[] = [
    {
      key: "home",
      label: "回到首页",
      description: "查看当前下一步和作品概览",
      to: "/",
      icon: Home,
    },
    {
      key: "novels",
      label: "我的小说",
      description: "切换作品或重新开书",
      to: "/novels",
      icon: BookOpenText,
    },
    {
      key: "workspace",
      label: "当前小说工作区",
      description: novelTitle,
      to: `/novels/${novelId}/edit`,
      icon: Sparkles,
    },
    {
      key: "tasks",
      label: "运行记录",
      description: "查看任务进度与恢复入口",
      to: "/tasks",
      icon: ListTodo,
    },
  ];

  if (directorTaskId) {
    items.push({
      key: "director-recover",
      label: "继续自动导演",
      description: "回到当前导演任务继续推进",
      to: `/novels/auto-director?taskId=${encodeURIComponent(directorTaskId)}`,
      icon: Sparkles,
    });
  }

  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-10 w-10 shrink-0"
        aria-label="打开导航菜单"
        title="打开导航菜单"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-4 w-4" aria-hidden="true" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen} direction="left">
        <SheetContent side="left" className="w-[min(100vw,20rem)] gap-0 p-0">
          <SheetHeader className="border-b px-4 py-4">
            <SheetTitle>工作区导航</SheetTitle>
            <SheetDescription>离开章节执行页后，可从这里回到首页或其他入口。</SheetDescription>
          </SheetHeader>
          <SheetBody className="space-y-2 px-3 py-3">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.key}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border bg-muted/15 px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5",
                  )}
                  onClick={() => setOpen(false)}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background text-foreground">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">{item.label}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.description}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              );
            })}

            {onOpenTaskDrawer ? (
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-2xl border bg-muted/15 px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
                onClick={() => {
                  setOpen(false);
                  onOpenTaskDrawer();
                }}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background text-foreground">
                  <ListTodo className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">本书任务进度</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">打开当前小说的任务抽屉</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            ) : null}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
