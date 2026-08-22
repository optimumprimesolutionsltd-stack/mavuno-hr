"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, PageHeader, Badge, Button, Input, Select, Label, Modal, Spinner, Th, Td, kes } from "@/components/ui";

interface Row {
  employee: {
    id: number; empNo: string; firstName: string; lastName: string; email: string;
    position: string; employmentType: string; status: string; basicSalary: string;
    houseAllowance: string; transportAllowance: string; otherAllowance: string; gender: string;
  };
  department: { id: number; name: string } | null;
}

export default function EmployeesPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({
    firstName: "", lastName: "", email: "", position: "", departmentId: "1", gender: "male",
    employmentType: "permanent", residentStatus: "resident", basicSalary: "", houseAllowance: "0",
    transportAllowance: "0", otherAllowance: "0", insurancePremium: "0", pensionEmployee: "0",
    helbMonthly: "0", bankName: "", bankAccount: "", kraPin: "",
  });

  const load = () => fetch("/api/employees").then((r) => r.json()).then(setRows);
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!rows) return null;
    const s = search.toLowerCase();
    return rows.filter((r) =>
      `${r.employee.firstName} ${r.employee.lastName} ${r.employee.position} ${r.department?.name || ""} ${r.employee.empNo}`
        .toLowerCase()
        .includes(s)
    );
  }, [rows, search]);

  const gross = (e: Row["employee"]) =>
    Number(e.basicSalary) + Number(e.houseAllowance) + Number(e.transportAllowance) + Number(e.otherAllowance);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.firstName || !form.lastName || !form.basicSalary) return alert("First name, last name and basic salary are required");
    setSaving(true);
    await fetch("/api/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
    setOpen(false);
    load();
  };

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle="Complete employee records — statutory identifiers, compensation structure, banking and employment terms."
        actions={<Button onClick={() => setOpen(true)}>+ Add Employee</Button>}
      />

      <div className="mb-4 max-w-sm">
        <Input placeholder="Search by name, role, department, staff no…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {!filtered ? <Spinner /> : (
        <Card className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-white/[0.06]">
              <tr>
                <Th>Employee</Th><Th>Department</Th><Th>Role</Th><Th>Type</Th>
                <Th right>Gross Pay</Th><Th>Status</Th><Th> </Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filtered.map((r) => (
                <tr key={r.employee.id} className="transition-colors hover:bg-white/[0.03]">
                  <Td>
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold ${r.employee.gender === "female" ? "bg-fuchsia-400/15 text-fuchsia-300" : "bg-sky-400/15 text-sky-300"}`}>
                        {r.employee.firstName[0]}{r.employee.lastName[0]}
                      </div>
                      <div>
                        <div className="font-medium text-slate-100">{r.employee.firstName} {r.employee.lastName}</div>
                        <div className="text-[11px] text-slate-500">{r.employee.empNo}</div>
                      </div>
                    </div>
                  </Td>
                  <Td>{r.department?.name || "—"}</Td>
                  <Td><span className="text-slate-400">{r.employee.position}</span></Td>
                  <Td><Badge value={r.employee.employmentType} /></Td>
                  <Td right><span className="font-semibold text-slate-100">{kes(gross(r.employee))}</span></Td>
                  <Td><Badge value={r.employee.status} /></Td>
                  <Td right>
                    <Link href={`/employees/${r.employee.id}`} className="text-[12px] font-semibold text-emerald-300 hover:underline">
                      Profile →
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add Employee">
        <div className="grid grid-cols-2 gap-4">
          <div><Label>First Name *</Label><Input value={form.firstName} onChange={set("firstName")} /></div>
          <div><Label>Last Name *</Label><Input value={form.lastName} onChange={set("lastName")} /></div>
          <div><Label>Email</Label><Input value={form.email} onChange={set("email")} placeholder="auto-generated if blank" /></div>
          <div><Label>KRA PIN</Label><Input value={form.kraPin} onChange={set("kraPin")} placeholder="A012345678Z" /></div>
          <div><Label>Position</Label><Input value={form.position} onChange={set("position")} /></div>
          <div>
            <Label>Department</Label>
            <Select value={form.departmentId} onChange={set("departmentId")}>
              <option value="1">Engineering</option><option value="2">Finance</option>
              <option value="3">Sales & Marketing</option><option value="4">Operations</option>
              <option value="5">Human Resources</option>
            </Select>
          </div>
          <div>
            <Label>Employment Type</Label>
            <Select value={form.employmentType} onChange={set("employmentType")}>
              <option value="permanent">Permanent</option><option value="contract">Contract</option><option value="casual">Casual</option>
            </Select>
          </div>
          <div>
            <Label>Tax Residency</Label>
            <Select value={form.residentStatus} onChange={set("residentStatus")}>
              <option value="resident">Resident</option><option value="non_resident">Non-Resident</option>
            </Select>
          </div>
          <div><Label>Basic Salary (KSh) *</Label><Input type="number" value={form.basicSalary} onChange={set("basicSalary")} /></div>
          <div><Label>House Allowance</Label><Input type="number" value={form.houseAllowance} onChange={set("houseAllowance")} /></div>
          <div><Label>Transport Allowance</Label><Input type="number" value={form.transportAllowance} onChange={set("transportAllowance")} /></div>
          <div><Label>Other Allowances</Label><Input type="number" value={form.otherAllowance} onChange={set("otherAllowance")} /></div>
          <div><Label>Insurance Premium /mo</Label><Input type="number" value={form.insurancePremium} onChange={set("insurancePremium")} /></div>
          <div><Label>Pension Contribution /mo</Label><Input type="number" value={form.pensionEmployee} onChange={set("pensionEmployee")} /></div>
          <div><Label>HELB Deduction /mo</Label><Input type="number" value={form.helbMonthly} onChange={set("helbMonthly")} /></div>
          <div><Label>Gender</Label>
            <Select value={form.gender} onChange={set("gender")}>
              <option value="male">Male</option><option value="female">Female</option>
            </Select>
          </div>
          <div><Label>Bank</Label><Input value={form.bankName} onChange={set("bankName")} placeholder="e.g. KCB Bank" /></div>
          <div><Label>Account Number</Label><Input value={form.bankAccount} onChange={set("bankAccount")} /></div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Create Employee"}</Button>
        </div>
      </Modal>
    </div>
  );
}
