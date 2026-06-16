import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

// Mirrors the project shape written by the back-office (see back-office/src/lib/projects.ts).
export type StageStatus = "pending" | "active" | "done";
export interface ProjectStage { id: string; name: string; description?: string; status: StageStatus; completedAt?: number | null; }

export type MilestoneKind = "percent" | "fixed";
export type MilestoneStatus = "due" | "paid";
export interface PaymentMilestone { id: string; label: string; stageId?: string | null; kind: MilestoneKind; value: number; status: MilestoneStatus; paidAt?: number | null; razorpayPaymentId?: string | null; }
export interface Payment { total: number; currency: string; milestones: PaymentMilestone[]; }

export type FieldType = "text" | "textarea" | "number" | "date" | "select" | "checkbox";
export interface RequirementField { id: string; label: string; type: FieldType; required: boolean; placeholder?: string; options?: string[]; }
export interface RequirementForm { title: string; intro?: string; fields: RequirementField[]; sent: boolean; sentAt?: number | null; responses?: Record<string, string>; submittedAt?: number | null; }

export interface ProjectClient { id: string; name: string; email: string; company?: string; }
export interface PortalAccess { email: string; code: string; enabled: boolean; }
export type ProjectStatus = "active" | "on-hold" | "completed";

export interface Project {
  id: string;
  title: string;
  summary?: string;
  status: ProjectStatus;
  clients: ProjectClient[];
  stages: ProjectStage[];
  payment: Payment;
  requirementForm: RequirementForm;
  portal: PortalAccess | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────
export function milestoneAmount(m: PaymentMilestone, total: number): number {
  if (m.kind === "percent") return Math.round((total * m.value) / 100);
  return Math.round(m.value);
}

export function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);
}

// ── Session ───────────────────────────────────────────────────────────────
const KEY = "ol_portal_session";
export interface PortalSession { projectId: string; email: string; code: string; }

export function getSession(): PortalSession | null {
  if (typeof window === "undefined") return null;
  try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}
export function setSession(s: PortalSession) { localStorage.setItem(KEY, JSON.stringify(s)); }
export function clearSession() { localStorage.removeItem(KEY); }

// ── Auth ──────────────────────────────────────────────────────────────────
// Look up the project by the (unguessable) id carried in the access link, then
// verify the email + access code against its portal record. Reading a single
// doc by id is what the Firestore rules allow for the public portal.
export async function login(projectId: string, email: string, code: string): Promise<{ ok: true; project: Project } | { ok: false; error: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = code.trim().toUpperCase();
  if (!projectId) return { ok: false, error: "This portal link is incomplete. Please open the link we emailed you." };
  try {
    const snap = await getDoc(doc(db, "projects", projectId));
    if (!snap.exists()) return { ok: false, error: "We couldn't find that project. Please open the link we emailed you." };
    const project = { id: snap.id, ...snap.data() } as Project;
    if (!project.portal?.enabled) return { ok: false, error: "Access to this portal is currently turned off. Please contact us." };
    if (project.portal.email !== cleanEmail || project.portal.code !== cleanCode) {
      return { ok: false, error: "Those details don't match. Check your email and access code." };
    }
    return { ok: true, project };
  } catch (e) {
    console.error("portal login failed", e);
    return { ok: false, error: "Something went wrong signing in. Please try again." };
  }
}
