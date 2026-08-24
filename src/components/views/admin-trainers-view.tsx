"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  GraduationCap,
  Plus,
  Pencil,
  Trash2,
  Users,
  UserCheck,
  UserX,
  Loader2,
  Save,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { useUIStore } from "@/lib/ui-store";

interface Trainer {
  id: string;
  name: string;
  phone: string;
  studentCount: number;
  createdAt: string;
}

interface UnassignedStudent {
  id: string;
  studentName: string;
  username: string;
  level: number;
  status: string;
}

interface TrainersResponse {
  stats: {
    totalTrainers: number;
    assignedStudents: number;
    totalStudents: number;
    unassignedCount: number;
  };
  trainers: Trainer[];
  unassignedStudents: UnassignedStudent[];
}

export function AdminTrainersView() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Trainer | null>(null);
  const [deleting, setDeleting] = useState<Trainer | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTrainer, setBulkTrainer] = useState("");

  const { data, isLoading } = useQuery<TrainersResponse>({
    queryKey: ["admin", "trainers"],
    queryFn: async () => {
      const res = await fetch("/api/admin/trainers", { credentials: "same-origin" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "fetch error");
      return j.data;
    },
  });

  const addMut = useMutation({
    mutationFn: async (payload: { name: string; phone: string; email?: string }) => {
      const res = await fetch("/api/admin/trainers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "add_trainer", ...payload }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "add failed");
      return j.data;
    },
    onSuccess: () => {
      toast.success("تمت إضافة المدرّب");
      qc.invalidateQueries({ queryKey: ["admin", "trainers"] });
      qc.invalidateQueries({ queryKey: ["trainers-list"] });
      setAddOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editMut = useMutation({
    mutationFn: async (payload: { id: string; name: string; phone: string }) => {
      const res = await fetch("/api/admin/trainers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "edit_trainer", ...payload }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "edit failed");
      return j.data;
    },
    onSuccess: () => {
      toast.success("تم تحديث المدرّب");
      qc.invalidateQueries({ queryKey: ["admin", "trainers"] });
      qc.invalidateQueries({ queryKey: ["trainers-list"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/admin/trainers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "delete_trainer", id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "delete failed");
      return j.data;
    },
    onSuccess: () => {
      toast.success("تم حذف المدرّب. أصبح طلابه الآن بدون مدرّب.");
      qc.invalidateQueries({ queryKey: ["admin", "trainers"] });
      qc.invalidateQueries({ queryKey: ["trainers-list"] });
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkAssignMut = useMutation({
    mutationFn: async (payload: { studentIds: string[]; trainerId: string }) => {
      const res = await fetch("/api/admin/trainers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "bulk_assign", ...payload }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "bulk failed");
      return j.data;
    },
    onSuccess: (d: { updated: number }) => {
      toast.success(`تم تخصيص ${d.updated} طالب للمدرّب`);
      qc.invalidateQueries({ queryKey: ["admin", "trainers"] });
      setSelected(new Set());
      setBulkTrainer("");
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

  return (
    <AdminShell activeKey="trainers" title="إدارة المدرّبين" subtitle="المدرّبون هم جهات اتصال — يمكنك تعيين طلاب متعددين لكل منهم">
      {/* ---------- Stats bar ---------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatCell icon={GraduationCap} label="إجمالي المدرّبين" value={data?.stats.totalTrainers ?? 0} tone="primary" />
        <StatCell icon={UserCheck} label="طلاب مخصصون" value={data?.stats.assignedStudents ?? 0} tone="success" />
        <StatCell icon={UserX} label="بدون مدرّب" value={data?.stats.unassignedCount ?? 0} tone="warning" />
        <StatCell icon={Users} label="إجمالي الطلاب" value={data?.stats.totalStudents ?? 0} tone="info" />
      </div>

      {/* ---------- Add trainer CTA ---------- */}
      <div className="flex justify-end">
        <Button className="gradient-primary text-white" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />مدرّب جديد
        </Button>
      </div>

      {/* ---------- Trainers grid ---------- */}
      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : data && data.trainers.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.trainers.map((t) => (
            <Card key={t.id} className="glass border border-[var(--glass-border)] p-4">
              <div className="flex items-start gap-3">
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback className="bg-accent/15 text-accent text-sm font-bold">
                    {t.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-bold">{t.name}</h3>
                  <p className="text-xs text-muted-foreground" dir="ltr">{t.phone}</p>
                  <Badge variant="secondary" className="mt-2 font-mono">
                    <Users className="h-3 w-3" />
                    <span className="num">{t.studentCount}</span> طالب
                  </Badge>
                </div>
                <div className="flex flex-col gap-1">
                  <Button size="icon" variant="ghost" onClick={() => setEditing(t)} title="تعديل">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleting(t)} title="حذف">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="glass border border-[var(--glass-border)] p-8 text-center">
          <GraduationCap className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">لا يوجد مدرّبون بعد</p>
        </Card>
      )}

      {/* ---------- Unassigned students panel ---------- */}
      {data && data.unassignedStudents.length > 0 && (
        <Card className="glass border border-warning/30 p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold">طلاب بدون مدرّب</h3>
              <p className="text-xs text-muted-foreground">اختر مجموعة وعيّنها لأحد المدرّبين دفعة واحدة</p>
            </div>
            {selected.size > 0 && (
              <div className="flex items-center gap-2">
                <Select value={bulkTrainer} onValueChange={setBulkTrainer}>
                  <SelectTrigger className="h-8 w-44"><SelectValue placeholder="اختر مدرّباً" /></SelectTrigger>
                  <SelectContent>
                    {data.trainers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  className="gradient-primary text-white"
                  disabled={!bulkTrainer || bulkAssignMut.isPending}
                  onClick={() => bulkAssignMut.mutate({ studentIds: [...selected], trainerId: bulkTrainer })}
                >
                  {bulkAssignMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  تخصيص <span className="num">{selected.size}</span>
                </Button>
              </div>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto rounded-md border border-[var(--glass-border)]">
            {data.unassignedStudents.map((s) => {
              const checked = selected.has(s.id);
              return (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-3 border-b border-[var(--glass-border)] p-2.5 last:border-b-0 hover:bg-accent/5"
                >
                  <Checkbox checked={checked} onCheckedChange={(v) => toggle(s.id, v === true)} />
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-xs gradient-primary text-white">{s.studentName.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{s.studentName}</div>
                    <div className="text-[11px] text-muted-foreground">@{s.username}</div>
                  </div>
                  <Badge variant="outline" className="font-mono">L{s.level}</Badge>
                </label>
              );
            })}
          </div>
        </Card>
      )}

      {/* ---------- Add trainer dialog ---------- */}
      <TrainerDialog
        key="add-trainer"
        open={addOpen}
        onOpenChange={setAddOpen}
        title="إضافة مدرّب"
        initialName=""
        initialPhone=""
        submitLabel="إضافة"
        isPending={addMut.isPending}
        onSubmit={(payload) => addMut.mutate(payload)}
      />

      {/* ---------- Edit trainer dialog ---------- */}
      {editing && (
        <TrainerDialog
          key={`edit-${editing.id}`}
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
          title="تعديل المدرّب"
          initialName={editing.name}
          initialPhone={editing.phone}
          submitLabel="حفظ"
          isPending={editMut.isPending}
          onSubmit={(payload) => editMut.mutate({ id: editing.id, name: payload.name, phone: payload.phone })}
        />
      )}

      {/* ---------- Delete confirmation ---------- */}
      <Dialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>حذف المدرّب</DialogTitle>
            <DialogDescription>
              سيتم حذف <b>{deleting?.name}</b>. طلابه (<span className="num">{deleting?.studentCount}</span>) سيصبحون بدون مدرّب.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>إلغاء</Button>
            <Button
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => deleting && deleteMut.mutate(deleting.id)}
            >
              {deleteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              حذف نهائي
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}

// --------------------------------------------------------------------
// Stat cell
// --------------------------------------------------------------------
function StatCell({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  tone: "primary" | "success" | "warning" | "info";
}) {
  const tones: Record<string, string> = {
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    info: "text-info",
  };
  return (
    <Card className="glass border border-[var(--glass-border)] p-4">
      <Icon className={`mb-2 h-5 w-5 ${tones[tone]}`} />
      <div className="font-mono text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}

// --------------------------------------------------------------------
// Trainer add/edit dialog
// --------------------------------------------------------------------
function TrainerDialog({
  open,
  onOpenChange,
  title,
  initialName,
  initialPhone,
  submitLabel,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  initialName: string;
  initialPhone: string;
  submitLabel: string;
  isPending: boolean;
  onSubmit: (payload: { name: string; phone: string; email?: string }) => void;
}) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  // (Component remounts on initial value change via `key` prop.)

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="t-name">الاسم</Label>
            <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} className="glass-input" />
          </div>
          <div>
            <Label htmlFor="t-phone">الهاتف</Label>
            <Input
              id="t-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="glass-input"
              dir="ltr"
              placeholder="01xxxxxxxxx"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button
            className="gradient-primary text-white"
            disabled={!name.trim() || phone.length < 6 || isPending}
            onClick={() => onSubmit({ name: name.trim(), phone: phone.trim() })}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
