"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { T } from "@/lib/theme";
import { Container, Btn, ArrowR } from "@/components/ui/Shared";
import { login, setSession, getSession } from "@/lib/portal";

export default function PortalLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (getSession()) { router.replace("/portal/dashboard"); return; }
    // The access link carries the project id, e.g. /portal?p=abc123
    const p = new URLSearchParams(window.location.search).get("p");
    if (p) setProjectId(p);
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    const res = await login(projectId, email, code);
    if (res.ok) {
      setSession({ projectId: res.project.id, email: email.trim().toLowerCase(), code: code.trim().toUpperCase() });
      router.push("/portal/dashboard");
    } else {
      setError(res.error); setBusy(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: T.paper, display: "grid", placeItems: "center", padding: "40px 0" }}>
      <Container style={{ maxWidth: 460 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <img src="/logo.png" alt="Only Logic" style={{ width: 150, margin: "0 auto 22px" }} />
          <div className="ol-mono" style={{ fontSize: 12, letterSpacing: ".16em", textTransform: "uppercase", color: T.blue, fontWeight: 500 }}>Client Portal</div>
          <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-.02em", margin: "12px 0 8px" }}>Track your project</h1>
          <p style={{ color: T.mute, fontSize: 15.5, lineHeight: 1.6 }}>Sign in with the email and access code we sent you.</p>
        </div>

        <form onSubmit={submit} style={{ background: T.panel, border: `1px solid ${T.line2}`, borderRadius: 22, padding: "28px 28px", boxShadow: "0 30px 60px -42px rgba(19,24,43,.25)" }}>
          {!projectId && (
            <div style={{ background: T.coralWash, border: `1px solid ${T.coral}33`, borderRadius: 12, padding: "12px 14px", marginBottom: 18, fontSize: 13.5, color: T.ink70, lineHeight: 1.5 }}>
              Please open the portal <strong>link</strong> we emailed you — it carries your project reference.
            </div>
          )}
          <Field label="Email" value={email} onChange={setEmail} ph="you@company.com" type="email" />
          <Field label="Access code" value={code} onChange={(v) => setCode(v.toUpperCase())} ph="ABCD2345" mono />
          {error && <div style={{ color: T.coral, fontSize: 13.5, margin: "4px 0 14px", lineHeight: 1.5 }}>{error}</div>}
          <Btn variant="primary" disabled={busy || !email || !code || !projectId} style={{ width: "100%", marginTop: 6, opacity: busy ? 0.7 : 1 }}>
            {busy ? "Signing in…" : <>Enter portal <ArrowR /></>}
          </Btn>
          <p className="ol-mono" style={{ fontSize: 11.5, color: T.faint, textAlign: "center", marginTop: 14, marginBottom: 0 }}>Lost your code? Reply to our email and we'll resend it.</p>
        </form>
      </Container>
    </main>
  );
}

function Field({ label, value, onChange, ph, type = "text", mono }: { label: string; value: string; onChange: (v: string) => void; ph: string; type?: string; mono?: boolean }) {
  const [f, setF] = useState(false);
  return (
    <div style={{ marginBottom: 16 }}>
      <label className="ol-mono" style={{ fontSize: 12, color: T.mute, display: "block", marginBottom: 7 }}>{label}</label>
      <input
        value={value} onChange={(e) => onChange(e.target.value)} placeholder={ph} type={type}
        onFocus={() => setF(true)} onBlur={() => setF(false)}
        style={{ width: "100%", padding: "13px 14px", borderRadius: 12, border: `1px solid ${f ? T.coral : T.line2}`, background: T.paper, fontSize: 15, fontFamily: mono ? "monospace" : "'Poppins',sans-serif", letterSpacing: mono ? ".18em" : "normal", fontWeight: mono ? 600 : 400, color: T.ink, outline: "none", boxShadow: f ? `0 0 0 4px ${T.coralWash}` : "none", transition: "all .2s" }}
      />
    </div>
  );
}
