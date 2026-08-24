"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Send,
  Loader2,
  Search,
  Trash2,
  Volume2,
  Mail,
  Check,
  ChevronsUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface NotificationLogItem {
  id: string;
  title: string;
  message: string;
  isBroadcast: boolean;
  target: { id: string; studentName: string; username: string } | null;
  createdAt: string;
}

interface LogResponse {
  items: NotificationLogItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

interface UserOption {
  id: string;
  studentName: string;
  username: string;
  email: string;
}

export function AdminNotificationsView() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // form state
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sendType, setSendType] = useState<"broadcast" | "specific">("broadcast");
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [targetQuery, setTargetQuery] = useState("");

  // bulk-select
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery<LogResponse>({
    queryKey: ["admin", "notifications", debouncedSearch, page],
    queryFn: async () => {
      const url = new URL("/api/admin/notifications", window.location.origin);
      if (debouncedSearch) url.searchParams.set("q", debouncedSearch);
      url.searchParams.set("page", String(page));
      const res = await fetch(url, { credentials: "same-origin" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "fetch error");
      return j.data;
    },
  });

  // user autocomplete
  const { data: userResults, isFetching: usersFetching } = useQuery<{ users: UserOption[] }>({
    queryKey: ["admin", "notifications", "users", targetQuery],
    queryFn: async () => {
      const url = new URL("/api/admin/notifications", window.location.origin);
      url.searchParams.set("target_user_query", targetQuery);
      const res = await fetch(url, { credentials: "same-origin" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "fetch error");
      return j.data;
    },
    enabled: sendType === "specific" && targetQuery.length >= 2,
  });

  const sendMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "send",
          title,
          message,
          sendType,
          targetUserId: sendType === "specific" ? targetUserId : undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "send failed");
      return j.data;
    },
    onSuccess: () => {
      toast.success(sendType === "broadcast" ? "تم البث العام للإشعار" : "تم إرسال الإشعار للطالب");
      qc.invalidateQueries({ queryKey: ["admin", "notifications"] });
      setTitle("");
      setMessage("");
      setTargetUserId(null);
      setTargetQuery("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "bulk_delete", ids: [...selected] }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "bulk delete failed");
      return j.data;
    },
    onSuccess: (d: { deleted: number }) => {
      toast.success(`تم حذف ${d.deleted} إشعار`);
      qc.invalidateQueries({ queryKey: ["admin", "notifications"] });
      setSelected(new Set());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteAllMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "delete_all" }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "delete all failed");
      return j.data;
    },
    onSuccess: (d: { deleted: number }) => {
      toast.success(`تم حذف جميع الإشعارات (${d.deleted})`);
      qc.invalidateQueries({ queryKey: ["admin", "notifications"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  };

  const targetUser = userResults?.users.find((u) => u.id === targetUserId) ?? null;

  return (
    <AdminShell activeKey="notifications" title="إرسال الإشعارات" subtitle="بث عام أو إرسال موجّه لطالب واحد">
      {/* ---------- Send form ---------- */}
      <Card className="glass border border-[var(--glass-border)] p-4 sm:p-5">
        <div className="space-y-3">
          <div>
            <Label htmlFor="n-title">العنوان</Label>
            <Input id="n-title" value={title} onChange={(e) => setTitle(e.target.value)} className="glass-input" placeholder="عنوان موجز للإشعار" />
          </div>
          <div>
            <Label htmlFor="n-msg">الرسالة</Label>
            <Textarea
              id="n-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="glass-input min-h-[120px]"
              placeholder="نص الإشعار (نص صريح فقط — لا HTML)"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              يُحفظ كنص صريح. لا يستخدم محرر غني لأسباب أمنية.
            </p>
          </div>
          <div>
            <Label>نوع الإرسال</Label>
            <RadioGroup value={sendType} onValueChange={(v) => setSendType(v as typeof sendType)} className="grid grid-cols-2 gap-2">
              <Label htmlFor="rt-broadcast" className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--glass-border)] bg-input/30 px-3 py-2 text-sm hover:bg-accent/10">
                <RadioGroupItem value="broadcast" id="rt-broadcast" />
                <Volume2 className="h-4 w-4 text-info" />بث عام
              </Label>
              <Label htmlFor="rt-specific" className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--glass-border)] bg-input/30 px-3 py-2 text-sm hover:bg-accent/10">
                <RadioGroupItem value="specific" id="rt-specific" />
                <Mail className="h-4 w-4 text-accent" />موجّه
              </Label>
            </RadioGroup>
          </div>

          {sendType === "specific" && (
            <div>
              <Label>الطالب المستهدف</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between">
                    {targetUser ? `${targetUser.studentName} (@${targetUser.username})` : "ابحث عن طالب…"}
                    <ChevronsUpDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0" align="start">
                  <Command>
                    <CommandInput
                      placeholder="اكتب اسم/بريد الطالب…"
                      value={targetQuery}
                      onValueChange={setTargetQuery}
                    />
                    <CommandList>
                      {usersFetching ? (
                        <div className="py-6 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div>
                      ) : (
                        <CommandEmpty>اكتب حرفين على الأقل</CommandEmpty>
                      )}
                      <CommandGroup>
                        {userResults?.users.map((u) => (
                          <CommandItem
                            key={u.id}
                            value={u.studentName + " " + u.username + " " + u.email}
                            onSelect={() => {
                              setTargetUserId(u.id);
                              setTargetQuery("");
                            }}
                          >
                            <Check className={u.id === targetUserId ? "h-4 w-4 opacity-100" : "h-4 w-4 opacity-0"} />
                            <div className="flex flex-col">
                              <span className="text-sm">{u.studentName}</span>
                              <span className="text-[11px] text-muted-foreground">@{u.username}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              className="gradient-primary text-white"
              disabled={!title.trim() || !message.trim() || sendMut.isPending || (sendType === "specific" && !targetUserId)}
              onClick={() => sendMut.mutate()}
            >
              {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              إرسال
            </Button>
          </div>
        </div>
      </Card>

      {/* ---------- Log ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="ابحث في العناوين…" className="glass-input pr-10" />
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <Button size="sm" variant="destructive" disabled={bulkDeleteMut.isPending} onClick={() => bulkDeleteMut.mutate()}>
              <Trash2 className="h-4 w-4" />حذف <span className="num">{selected.size}</span>
            </Button>
          )}
          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={deleteAllMut.isPending} onClick={() => {
            if (confirm("حذف كل الإشعارات نهائياً؟ هذا الإجراء لا يمكن التراجع عنه.")) {
              deleteAllMut.mutate();
            }
          }}>
            <Trash2 className="h-4 w-4" />حذف الكل
          </Button>
        </div>
      </div>

      <Card className="glass border border-[var(--glass-border)] p-0">
        <div className="max-h-[60vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--glass-border)] hover:bg-transparent">
                <TableHead className="w-8"></TableHead>
                <TableHead>العنوان</TableHead>
                <TableHead className="hidden sm:table-cell">المستهدف</TableHead>
                <TableHead className="hidden md:table-cell">الرسالة</TableHead>
                <TableHead>التاريخ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : data && data.items.length > 0 ? (
                data.items.map((n) => (
                  <TableRow key={n.id} className="border-[var(--glass-border)] hover:bg-accent/5">
                    <TableCell>
                      <Checkbox checked={selected.has(n.id)} onCheckedChange={(v) => toggle(n.id, v === true)} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {n.isBroadcast ? <Volume2 className="h-4 w-4 text-info" /> : <Mail className="h-4 w-4 text-accent" />}
                        <span className="font-semibold text-sm">{n.title}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm">
                      {n.target ? n.target.studentName : <Badge variant="secondary">بث عام</Badge>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell max-w-xs">
                      <p className="truncate text-xs text-muted-foreground">{n.message}</p>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: ar })}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    لا توجد إشعارات
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 border-t border-[var(--glass-border)] p-3">
            <div className="text-xs text-muted-foreground">
              صفحة <span className="num">{page}</span> من <span className="num">{data.pagination.totalPages}</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>السابق</Button>
              <Button size="sm" variant="outline" disabled={page >= data.pagination.totalPages} onClick={() => setPage((p) => p + 1)}>التالي</Button>
            </div>
          </div>
        )}
      </Card>
    </AdminShell>
  );
}
