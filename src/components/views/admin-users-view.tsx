"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth-context";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  Clock,
  GraduationCap,
  FileText,
  Settings,
  Search,
  Plus,
  Power,
  Trash2,
  Loader2,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface AdminUser {
  id: string;
  username: string;
  studentName: string;
  email: string;
  phone: string | null;
  level: number;
  role: string;
  status: "pending" | "approved" | "expired";
  pvpPoints: number;
  totalPoints: number;
  currentStatus: string;
  validityEnd: string | null;
  trainerId: string | null;
  trainer: { id: string; name: string } | null;
  createdAt: string;
}

interface UserListResponse {
  stats: {
    totalUsers: number;
    pendingCount: number;
    trainersCount: number;
    examsCount: number;
  };
  users: AdminUser[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

interface Trainer {
  id: string;
  name: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  approved: { label: "نشط", color: "bg-success/15 text-success border-success/30" },
  pending: { label: "قيد الانتظار", color: "bg-warning/15 text-warning border-warning/30" },
  expired: { label: "منتهٍ", color: "bg-destructive/15 text-destructive border-destructive/30" },
};

function fmtValidity(end: string | null): string {
  if (!end) return "—";
  const d = new Date(end);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days <= 0) return "منتهٍ";
  return `${days} يوم`;
}

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tz).toISOString().slice(0, 16);
  } catch {
    return "";
  }
}

export function AdminUsersView() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [addTrainerOpen, setAddTrainerOpen] = useState(false);
  const [newTrainerName, setNewTrainerName] = useState("");
  const [newTrainerPhone, setNewTrainerPhone] = useState("");

  // search debounce
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery<UserListResponse>({
    queryKey: ["admin", "users", debounced, page],
    queryFn: async () => {
      const url = new URL("/api/admin/users", window.location.origin);
      if (debounced) url.searchParams.set("q", debounced);
      url.searchParams.set("page", String(page));
      const res = await fetch(url, { credentials: "same-origin" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "fetch error");
      return j.data;
    },
    enabled: !!user && user.role === "admin",
  });

  const { data: trainers } = useQuery<Trainer[]>({
    queryKey: ["trainers-list"],
    queryFn: async () => {
      const res = await fetch("/api/trainers", { credentials: "same-origin" });
      const j = await res.json();
      return j.data?.trainers ?? [];
    },
  });

  // mutations
  const updateUser = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "update_user", ...payload }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "update failed");
      return j.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
      toast.success("تم حفظ التغييرات" + (data?.autoExtended ? " (تم تمديد الاشتراك شهراً)" : ""));
      setEditOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const logoutDevice = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "logout_device", id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "logout failed");
      return j.data;
    },
    onSuccess: () => {
      toast.success("تم إنهاء جلسات الجهاز");
      setEditOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteUser = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "delete_user", id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "delete failed");
      return j.data;
    },
    onSuccess: () => {
      toast.success("تم حذف المستخدم نهائياً");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      setEditOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addTrainerMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/trainers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "add_trainer",
          name: newTrainerName,
          phone: newTrainerPhone,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "add trainer failed");
      return j.data;
    },
    onSuccess: () => {
      toast.success("تمت إضافة المدرّب");
      qc.invalidateQueries({ queryKey: ["trainers-list"] });
      setAddTrainerOpen(false);
      setNewTrainerName("");
      setNewTrainerPhone("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!user || user.role !== "admin") return null;

  const openEdit = (u: AdminUser) => {
    setEditing(u);
    setEditOpen(true);
  };

  return (
    <AdminShell activeKey="users" title="إدارة المستخدمين" subtitle="إدارة حسابات الطلاب والمدرّبين">
      {/* ---------- Stats grid ---------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatCard icon={Users} label="إجمالي الطلاب" value={data?.stats.totalUsers ?? 0} tone="primary" />
        <StatCard icon={Clock} label="قيد الانتظار" value={data?.stats.pendingCount ?? 0} tone="warning" />
        <StatCard icon={GraduationCap} label="المدرّبون" value={data?.stats.trainersCount ?? 0} tone="accent" />
        <StatCard icon={FileText} label="الامتحانات" value={data?.stats.examsCount ?? 0} tone="info" />
      </div>

      {/* ---------- Add trainer quick form ---------- */}
      <Card className="glass border border-[var(--glass-border)] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="font-bold">إضافة مدرّب جديد</h3>
            <p className="text-xs text-muted-foreground">المدرّبون هم جهات اتصال (بدون تسجيل دخول)</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setAddTrainerOpen(true)}>
            <Plus className="h-4 w-4" />مدرّب جديد
          </Button>
        </div>
      </Card>

      {/* ---------- Search ---------- */}
      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="ابحث بالاسم أو البريد أو الهاتف…"
          className="glass-input pr-10"
        />
      </div>

      {/* ---------- Users table ---------- */}
      <Card className="glass border border-[var(--glass-border)] p-0">
        <div className="max-h-[70vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--glass-border)] hover:bg-transparent">
                <TableHead>المستخدم</TableHead>
                <TableHead className="hidden md:table-cell">المستوى</TableHead>
                <TableHead className="hidden lg:table-cell">المدرّب</TableHead>
                <TableHead className="hidden sm:table-cell">الاشتراك</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="text-left">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : data && data.users.length > 0 ? (
                data.users.map((u) => {
                  const st = STATUS_LABELS[u.status] ?? STATUS_LABELS.pending;
                  return (
                    <TableRow
                      key={u.id}
                      className="border-[var(--glass-border)] hover:bg-accent/5 cursor-pointer"
                      onClick={() => openEdit(u)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 shrink-0">
                            <AvatarFallback className="gradient-primary text-white text-sm font-bold">
                              {u.studentName.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="truncate font-semibold">{u.studentName}</div>
                            <div className="text-xs text-muted-foreground">@{u.username}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="secondary" className="font-mono">L{u.level}</Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">
                        {u.trainer ? u.trainer.name : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm">
                        <span className="num">{fmtValidity(u.validityEnd)}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={st.color}>{st.label}</Badge>
                      </TableCell>
                      <TableCell className="text-left">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(u);
                          }}
                          title="إعدادات"
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    لا يوجد مستخدمون مطابقون
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
              {" "}— إجمالي <span className="num">{data.pagination.total}</span> مستخدم
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >السابق</Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= data.pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >التالي</Button>
            </div>
          </div>
        )}
      </Card>

      {/* ---------- Edit dialog ---------- */}
      {editing && (
        <EditUserDialog
          key={editing.id}
          open={editOpen}
          onOpenChange={setEditOpen}
          user={editing}
          trainers={trainers ?? []}
          onUpdate={(payload) => updateUser.mutate(payload)}
          onLogout={() => logoutDevice.mutate(editing.id)}
          onDelete={() => {
            if (confirm(`حذف "${editing.studentName}" نهائياً؟ لا يمكن التراجع.`)) {
              deleteUser.mutate(editing.id);
            }
          }}
          isPending={updateUser.isPending}
        />
      )}

      {/* ---------- Add trainer dialog ---------- */}
      <Dialog open={addTrainerOpen} onOpenChange={setAddTrainerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة مدرّب</DialogTitle>
            <DialogDescription>أدخل اسم المدرّب ورقم هاتفه</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="t-name">الاسم</Label>
              <Input
                id="t-name"
                value={newTrainerName}
                onChange={(e) => setNewTrainerName(e.target.value)}
                placeholder="مدرّب جديد"
                className="glass-input"
              />
            </div>
            <div>
              <Label htmlFor="t-phone">الهاتف</Label>
              <Input
                id="t-phone"
                value={newTrainerPhone}
                onChange={(e) => setNewTrainerPhone(e.target.value)}
                placeholder="01xxxxxxxxx"
                className="glass-input"
                dir="ltr"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddTrainerOpen(false)}>إلغاء</Button>
            <Button
              className="gradient-primary text-white"
              disabled={!newTrainerName || newTrainerPhone.length < 6 || addTrainerMut.isPending}
              onClick={() => addTrainerMut.mutate()}
            >
              {addTrainerMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              إضافة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}

// --------------------------------------------------------------------
// Stat card
// --------------------------------------------------------------------
function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  tone: "primary" | "warning" | "accent" | "info";
}) {
  const tones: Record<string, string> = {
    primary: "text-primary",
    warning: "text-warning",
    accent: "text-accent",
    info: "text-info",
  };
  return (
    <Card className="glass border border-[var(--glass-border)] p-4 sm:p-5">
      <Icon className={`mb-2 h-5 w-5 ${tones[tone]}`} />
      <div className="font-mono text-2xl font-bold sm:text-3xl">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}

// --------------------------------------------------------------------
// Edit user dialog
// --------------------------------------------------------------------
function EditUserDialog({
  open,
  onOpenChange,
  user,
  trainers,
  onUpdate,
  onLogout,
  onDelete,
  isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  user: AdminUser;
  trainers: Trainer[];
  onUpdate: (payload: Record<string, unknown>) => void;
  onLogout: () => void;
  onDelete: () => void;
  isPending: boolean;
}) {
  const [studentName, setStudentName] = useState(user.studentName);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [level, setLevel] = useState(String(user.level));
  const [trainerId, setTrainerId] = useState(user.trainerId ?? "");
  const [validityEnd, setValidityEnd] = useState(toDatetimeLocalValue(user.validityEnd));
  const [status, setStatus] = useState<"approved" | "pending" | "expired">(user.status);
  const [newPassword, setNewPassword] = useState("");
  const [validityManuallyChanged, setValidityManuallyChanged] = useState(false);
  // (Component remounts on user change via `key={editing.id}`.)

  const handleValidityChange = (v: string) => {
    setValidityEnd(v);
    setValidityManuallyChanged(true);
  };

  const submit = () => {
    if (!studentName.trim() || !email.trim()) {
      toast.error("الاسم والبريد مطلوبان");
      return;
    }
    onUpdate({
      id: user.id,
      studentName: studentName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      level: parseInt(level, 10) || 1,
      trainerId: trainerId || null,
      validityEnd: validityEnd ? new Date(validityEnd).toISOString() : null,
      status,
      new_password: newPassword.trim() || undefined,
      validityManuallyChanged,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="gradient-primary text-white text-xs">
                {user.studentName.charAt(0)}
              </AvatarFallback>
            </Avatar>
            تعديل المستخدم
          </DialogTitle>
          <DialogDescription>
            @{user.username} · أُنشئ {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true, locale: ar })}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          <div>
            <Label>الاسم</Label>
            <Input value={studentName} onChange={(e) => setStudentName(e.target.value)} className="glass-input" />
          </div>
          <div>
            <Label>البريد الإلكتروني</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="glass-input"
              dir="ltr"
            />
          </div>
          <div>
            <Label>الهاتف</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="glass-input" dir="ltr" placeholder="—" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>المستوى</Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>مستوى {i + 1}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>المدرّب</Label>
              <Select value={trainerId} onValueChange={setTrainerId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="بدون مدرّب" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">بدون مدرّب</SelectItem>
                  {trainers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>انتهاء الاشتراك</Label>
            <Input
              type="datetime-local"
              value={validityEnd}
              onChange={(e) => handleValidityChange(e.target.value)}
              className="glass-input"
              dir="ltr"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              عند تفعيل الحساب للمرة الأولى وعدم تغيير التاريخ يدوياً، يُمدّد تلقائياً شهراً كاملاً.
            </p>
          </div>
          <div>
            <Label>الحالة</Label>
            <RadioGroup
              value={status}
              onValueChange={(v) => setStatus(v as typeof status)}
              className="grid grid-cols-3 gap-2"
            >
              <RadioStatusCard value="approved" label="نشط" />
              <RadioStatusCard value="pending" label="قيد الانتظار" />
              <RadioStatusCard value="expired" label="منتهٍ" />
            </RadioGroup>
          </div>
          <div>
            <Label>كلمة مرور جديدة (اختياري)</Label>
            <Input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="glass-input"
              dir="ltr"
              placeholder="اتركه فارغاً لعدم التغيير"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              يتم تخزينها مشفّرة (bcrypt) فقط — لا يتم حفظ أي نص صريح.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--glass-border)] pt-3">
          <Button variant="outline" size="sm" onClick={onLogout}>
            <Power className="h-4 w-4" />إنهاء جلسات الجهاز
          </Button>
          <Button variant="destructive" size="sm" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />حذف نهائي
          </Button>
          <Button
            className="gradient-primary ml-auto text-white"
            size="sm"
            onClick={submit}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            حفظ
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RadioStatusCard({ value, label }: { value: string; label: string }) {
  return (
    <Label
      htmlFor={`status-${value}`}
      className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--glass-border)] bg-input/30 px-3 py-2 text-sm hover:bg-accent/10"
    >
      <RadioGroupItem value={value} id={`status-${value}`} />
      {label}
    </Label>
  );
}
