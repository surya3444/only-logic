"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { T } from "@/lib/theme";
import { Container } from "@/components/ui/Shared";
import {
  getSession, clearSession, milestoneAmount, formatINR,
  type Project, type ProjectStage, type PaymentMilestone, type RequirementField,
} from "@/lib/portal";

type View = "loading" | "ready" | "denied";

export default function PortalDashboard() {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [view, setView] = useState<View>("loading");

  useEffect(() => {
    const session = getSession();
    if (!session) { router.replace("/portal"); return; }
    const unsub = onSnapshot(doc(db, "projects", session.projectId), (snap) => {
      if (!snap.exists()) { setView("denied"); return; }
      const p = { id: snap.id, ...snap.data() } as Project;
      if (!p.portal?.enabled || p.portal.code !== session.code || p.portal.email !== session.email) { setView("denied"); return; }
      setProject(p); setView("ready");
    }, () => setView("denied"));
    return () => unsub();
  }, [router]);

  const logout = () => { clearSession(); router.replace("/portal"); };

  if (view === "loading") return <Splash text="Loading your project…" />;
  if (view === "denied" || !project) return (
    <Splash text="This portal link is no longer active." action={<button onClick={logout} style={linkBtn}>Back to sign in</button>} />
  );

  const session = getSession()!;
  const me = (project.clients || []).find((c) => c.email === session.email);
  const firstName = (me?.name || "there").split(" ")[0];

  return (
    <main style={{ minHeight: "100vh", background: T.paper }}>
      {/* Top bar */}
      <div style={{ borderBottom: `1px solid ${T.line}`, background: "rgba(252,251,248,.9)", backdropFilter: "blur(14px)", position: "sticky", top: 0, zIndex: 30 }}>
        <Container style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 68 }}>
          <img src="/logo.png" alt="Only Logic" style={{ width: 124 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span className="ol-mono" style={{ fontSize: 12.5, color: T.mute }}>{me?.name || session.email}</span>
            <button onClick={logout} style={linkBtn}>Sign out</button>
          </div>
        </Container>
      </div>

      <Container style={{ padding: "36px 24px 90px", maxWidth: 920 }}>
        <div style={{ marginBottom: 30 }}>
          <div className="ol-mono" style={{ fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: T.blue, fontWeight: 500 }}>Hi {firstName} 👋 · Your project</div>
          <h1 style={{ fontSize: "clamp(28px,4.5vw,40px)", fontWeight: 700, letterSpacing: "-.02em", margin: "10px 0 0", lineHeight: 1.1 }}>{project.title}</h1>
          {project.summary && <p style={{ color: T.mute, fontSize: 16.5, lineHeight: 1.6, marginTop: 12, maxWidth: 640 }}>{project.summary}</p>}
        </div>

        <ProjectBody project={project} email={session.email} />
        <Requirements project={project} />
      </Container>
    </main>
  );
}

// Timeline (with inline payments) + the payments summary share one payment hook.
function ProjectBody({ project, email }: { project: Project; email: string }) {
  const pay = usePayments(project, email);
  return (
    <>
      <Timeline project={project} pay={pay} />
      <Payments project={project} pay={pay} />
    </>
  );
}

// ── Payment hook ────────────────────────────────────────────────────────────
function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

interface PayApi { run: (m: PaymentMilestone) => void; paying: string | null; err: string; }

function usePayments(project: Project, email: string): PayApi {
  const [paying, setPaying] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const run = async (m: PaymentMilestone) => {
    setErr(""); setPaying(m.id);
    try {
      const ok = await loadRazorpay();
      if (!ok) throw new Error("Couldn't load the payment gateway.");
      const res = await fetch("/api/razorpay/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project.id, milestoneId: m.id }) });
      const order = await res.json();
      if (!order.ok) throw new Error(order.error || "Couldn't start the payment.");

      const rzp = new (window as any).Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: "Only Logic",
        description: m.label,
        prefill: { email },
        theme: { color: "#13182B" },
        handler: async (resp: any) => {
          const v = await fetch("/api/razorpay/verify", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId: project.id, milestoneId: m.id, ...resp }),
          });
          const vr = await v.json();
          if (!vr.ok) setErr("Payment couldn't be verified. If you were charged, contact us.");
          setPaying(null);
        },
        modal: { ondismiss: () => setPaying(null) },
      });
      rzp.on("payment.failed", () => { setErr("Payment failed. Please try again."); setPaying(null); });
      rzp.open();
    } catch (e: any) {
      setErr(e.message || "Something went wrong."); setPaying(null);
    }
  };

  return { run, paying, err };
}

// ── Timeline (stages with payments woven in) ─────────────────────────────────
type Row = { kind: "stage"; stage: ProjectStage } | { kind: "pay"; m: PaymentMilestone };

function Timeline({ project, pay }: { project: Project; pay: PayApi }) {
  const stages = project.stages || [];
  if (!stages.length) return null;
  const total = project.payment?.total || 0;
  const milestones = project.payment?.milestones || [];
  const done = stages.filter((s) => s.status === "done").length;
  const pct = Math.round((done / stages.length) * 100);

  // Build a single rail: each stage followed by the payments tied to it.
  const rows: Row[] = [];
  stages.forEach((s) => {
    rows.push({ kind: "stage", stage: s });
    milestones.filter((m) => m.stageId === s.id).forEach((m) => rows.push({ kind: "pay", m }));
  });

  return (
    <Section title="Project timeline" right={<span className="ol-mono" style={{ fontSize: 13, color: T.mute }}>{done}/{stages.length} complete · {pct}%</span>}>
      <div style={{ height: 6, borderRadius: 999, background: T.line, overflow: "hidden", marginBottom: 26 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: T.blue, borderRadius: 999, transition: "width .5s" }} />
      </div>
      {pay.err && <ErrBanner text={pay.err} />}
      <div style={{ position: "relative" }}>
        {rows.map((row, i) => {
          const last = i === rows.length - 1;
          const rail = !last && <div style={{ position: "absolute", left: 15, top: 32, bottom: 0, width: 2, background: T.line }} />;
          if (row.kind === "stage") {
            const s = row.stage;
            const color = s.status === "done" ? T.green : s.status === "active" ? T.blue : T.faint;
            const bg = s.status === "done" ? "#E6F6EF" : s.status === "active" ? T.blueWash : T.wash;
            return (
              <div key={s.id} style={{ display: "flex", gap: 16, paddingBottom: last ? 0 : 22, position: "relative" }}>
                {rail}
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: bg, color, display: "grid", placeItems: "center", flexShrink: 0, zIndex: 1, border: `1px solid ${color}22` }}>
                  {s.status === "done" ? <CheckIcon /> : s.status === "active" ? <Dot pulse /> : <Dot />}
                </div>
                <div style={{ paddingTop: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 16, fontWeight: 600, color: T.ink }}>{s.name}</span>
                    <span className="ol-mono" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".1em", color, background: bg, padding: "3px 8px", borderRadius: 999, fontWeight: 600 }}>{s.status}</span>
                  </div>
                  {s.description && <p style={{ color: T.mute, fontSize: 14.5, lineHeight: 1.55, margin: "5px 0 0" }}>{s.description}</p>}
                </div>
              </div>
            );
          }
          // payment row, indented to read as "due at this stage"
          const m = row.m;
          const isPaid = m.status === "paid";
          const c = isPaid ? T.green : T.coral;
          return (
            <div key={m.id} style={{ display: "flex", gap: 16, paddingBottom: last ? 0 : 22, position: "relative" }}>
              {rail}
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: isPaid ? "#E6F6EF" : T.coralWash, color: c, display: "grid", placeItems: "center", flexShrink: 0, zIndex: 1, border: `1px solid ${c}22`, fontSize: 14, fontWeight: 700 }}>₹</div>
              <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", border: `1px solid ${isPaid ? "#CFE9DD" : T.coral + "44"}`, background: isPaid ? "#F6FBF8" : "#FFF8F6", borderRadius: 14, padding: "12px 16px" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: T.ink }}>{m.label}</div>
                  <div className="ol-mono" style={{ fontSize: 11.5, color: T.mute, marginTop: 2, textTransform: "uppercase", letterSpacing: ".08em" }}>{isPaid ? "Paid" : "Payment due"} · {m.kind === "percent" ? `${m.value}%` : "fixed"}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>{formatINR(milestoneAmount(m, total))}</span>
                  {isPaid ? (
                    <span className="ol-mono" style={{ fontSize: 12, fontWeight: 600, color: T.green, display: "inline-flex", alignItems: "center", gap: 5 }}><CheckIcon c={T.green} s={13} /> Paid</span>
                  ) : (
                    <button onClick={() => pay.run(m)} disabled={!!pay.paying} style={{ ...primaryBtn, background: T.coral, boxShadow: `0 12px 26px -14px ${T.coral}`, padding: "9px 18px", fontSize: 13.5, opacity: pay.paying && pay.paying !== m.id ? 0.5 : 1 }}>
                      {pay.paying === m.id ? "Opening…" : "Pay now"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ── Requirements form ───────────────────────────────────────────────────────
function Requirements({ project }: { project: Project }) {
  const form = project.requirementForm;
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  if (!form?.sent) return null;
  const submitted = !!form.submittedAt || done;

  if (submitted) {
    return (
      <Section title={form.title || "Requirements"}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", background: "#E6F6EF", border: `1px solid ${T.green}33`, borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: T.green, display: "grid", placeItems: "center", flexShrink: 0 }}><CheckIcon c="#fff" /></div>
          <div><div style={{ fontWeight: 600, fontSize: 15.5, color: T.ink }}>Requirements received</div><div style={{ fontSize: 14, color: T.mute }}>Thanks! We've got everything we need to push ahead.</div></div>
        </div>
      </Section>
    );
  }

  const set = (id: string, v: string) => setValues((p) => ({ ...p, [id]: v }));
  const missing = (form.fields || []).filter((f) => f.required && !(values[f.id] && values[f.id].trim()));

  const submit = async () => {
    if (missing.length) { setErr("Please complete the required fields."); return; }
    setBusy(true); setErr("");
    try {
      await updateDoc(doc(db, "projects", project.id), {
        "requirementForm.responses": values,
        "requirementForm.submittedAt": Date.now(),
      });
      setDone(true);
    } catch (e) { console.error(e); setErr("Couldn't submit — please try again."); setBusy(false); }
  };

  return (
    <Section title={form.title || "Requirements"} subtitle={form.intro}>
      <div style={{ display: "grid", gap: 18 }}>
        {(form.fields || []).map((f) => <FormField key={f.id} field={f} value={values[f.id] || ""} onChange={(v) => set(f.id, v)} />)}
      </div>
      {err && <div style={{ color: T.coral, fontSize: 13.5, marginTop: 14 }}>{err}</div>}
      <button onClick={submit} disabled={busy} style={{ ...primaryBtn, marginTop: 20, opacity: busy ? 0.7 : 1 }}>{busy ? "Submitting…" : "Submit requirements"}</button>
    </Section>
  );
}

function FormField({ field, value, onChange }: { field: RequirementField; value: string; onChange: (v: string) => void }) {
  const base: React.CSSProperties = { width: "100%", padding: "12px 14px", borderRadius: 12, border: `1px solid ${T.line2}`, background: T.paper, fontSize: 15, fontFamily: "'Poppins',sans-serif", color: T.ink, outline: "none" };
  return (
    <div>
      <label className="ol-mono" style={{ fontSize: 12, color: T.mute, display: "block", marginBottom: 7 }}>{field.label}{field.required && <span style={{ color: T.coral }}> *</span>}</label>
      {field.type === "textarea" ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} rows={4} style={{ ...base, resize: "vertical", lineHeight: 1.5 }} />
      ) : field.type === "select" ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...base, appearance: "none" }}>
          <option value="">Select…</option>
          {(field.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : field.type === "checkbox" ? (
        <div style={{ display: "flex", gap: 10 }}>
          {["Yes", "No"].map((o) => (
            <button key={o} type="button" onClick={() => onChange(o)} style={{ flex: 1, padding: "11px", borderRadius: 12, border: `1.5px solid ${value === o ? T.blue : T.line2}`, background: value === o ? T.blueWash : T.paper, color: value === o ? T.blue : T.mute, fontWeight: 600, fontSize: 14.5, cursor: "pointer" }}>{o}</button>
          ))}
        </div>
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} style={base} />
      )}
    </div>
  );
}

// ── Payments summary (+ any payments not tied to a stage) ──────────────────────
function Payments({ project, pay }: { project: Project; pay: PayApi }) {
  const payment = project.payment;
  const milestones = payment?.milestones || [];
  const total = payment?.total || 0;
  if (!total || !milestones.length) return null;

  const paid = milestones.filter((m) => m.status === "paid").reduce((s, m) => s + milestoneAmount(m, total), 0);
  const outstanding = milestones.filter((m) => m.status !== "paid").reduce((s, m) => s + milestoneAmount(m, total), 0);
  const stageIds = new Set((project.stages || []).map((s) => s.id));
  const unlinked = milestones.filter((m) => !m.stageId || !stageIds.has(m.stageId));

  return (
    <Section title="Payments" right={<span className="ol-mono" style={{ fontSize: 13, color: T.mute }}>{formatINR(paid)} of {formatINR(total)} paid</span>}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: unlinked.length ? 22 : 0 }} className="ol-pay-stats">
        <Stat label="Total" value={formatINR(total)} color={T.ink} />
        <Stat label="Paid" value={formatINR(paid)} color={T.green} />
        <Stat label="Outstanding" value={formatINR(outstanding)} color={T.coral} />
      </div>

      {unlinked.length > 0 && (
        <>
          {pay.err && <ErrBanner text={pay.err} />}
          <div style={{ display: "grid", gap: 12 }}>
            {unlinked.map((m) => {
              const isPaid = m.status === "paid";
              return (
                <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", border: `1px solid ${T.line2}`, borderRadius: 14, padding: "16px 18px", background: isPaid ? "#F6FBF8" : T.panel }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 600, color: T.ink }}>{m.label}</div>
                    <div style={{ fontSize: 13, color: T.mute, marginTop: 3 }}>{m.kind === "percent" ? `${m.value}% of total` : "Fixed amount"}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span style={{ fontSize: 17, fontWeight: 700, color: T.ink }}>{formatINR(milestoneAmount(m, total))}</span>
                    {isPaid ? (
                      <span className="ol-mono" style={{ fontSize: 12, fontWeight: 600, color: T.green, background: "#E6F6EF", padding: "7px 13px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 6 }}><CheckIcon c={T.green} s={13} /> Paid</span>
                    ) : (
                      <button onClick={() => pay.run(m)} disabled={!!pay.paying} style={{ ...primaryBtn, padding: "10px 20px", fontSize: 14, opacity: pay.paying && pay.paying !== m.id ? 0.5 : 1 }}>
                        {pay.paying === m.id ? "Opening…" : "Pay now"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      <p className="ol-mono" style={{ fontSize: 11.5, color: T.faint, marginTop: 14 }}>Secured by Razorpay · test mode.</p>
      <style>{`@media(max-width:560px){.ol-pay-stats{grid-template-columns:1fr !important;}}`}</style>
    </Section>
  );
}

// ── Shared bits ─────────────────────────────────────────────────────────────
function Section({ title, subtitle, right, children }: { title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section style={{ background: T.panel, border: `1px solid ${T.line2}`, borderRadius: 20, padding: "26px 26px", marginBottom: 22, boxShadow: "0 24px 50px -42px rgba(19,24,43,.2)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: subtitle ? 6 : 20, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-.01em", margin: 0 }}>{title}</h2>
        {right}
      </div>
      {subtitle && <p style={{ color: T.mute, fontSize: 14.5, lineHeight: 1.55, margin: "0 0 20px" }}>{subtitle}</p>}
      {children}
    </section>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ border: `1px solid ${T.line}`, borderRadius: 14, padding: "14px 16px", background: T.paper }}>
      <div style={{ fontSize: 19, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div className="ol-mono" style={{ fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: T.faint, marginTop: 7 }}>{label}</div>
    </div>
  );
}

function ErrBanner({ text }: { text: string }) {
  return <div style={{ color: T.coral, fontSize: 13.5, marginBottom: 16, background: T.coralWash, border: `1px solid ${T.coral}33`, borderRadius: 12, padding: "10px 14px" }}>{text}</div>;
}

function Splash({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <main style={{ minHeight: "100vh", background: T.paper, display: "grid", placeItems: "center", textAlign: "center", padding: 24 }}>
      <div>
        <img src="/logo.png" alt="Only Logic" style={{ width: 130, margin: "0 auto 20px", opacity: 0.9 }} />
        <p style={{ color: T.mute, fontSize: 16 }}>{text}</p>
        {action && <div style={{ marginTop: 18 }}>{action}</div>}
      </div>
    </main>
  );
}

const Dot = ({ pulse }: { pulse?: boolean }) => <span style={{ width: 9, height: 9, borderRadius: "50%", background: "currentColor", animation: pulse ? "ol-glow 2s ease-in-out infinite" : "none" }} />;
const CheckIcon = ({ c = "currentColor", s = 16 }: { c?: string; s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;

const linkBtn: React.CSSProperties = { background: "none", border: "none", color: T.mute, fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "'Poppins',sans-serif", textDecoration: "underline", textUnderlineOffset: 3 };
const primaryBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px 24px", borderRadius: 12, fontWeight: 600, fontSize: 15, border: "none", background: T.ink, color: "#fff", cursor: "pointer", fontFamily: "'Poppins',sans-serif", boxShadow: "0 14px 30px -14px rgba(19,24,43,.55)" };
