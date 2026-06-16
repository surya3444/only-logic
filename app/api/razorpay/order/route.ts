import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

// Amount of a milestone against the project total (mirrors lib/portal.ts).
function milestoneAmount(m: any, total: number): number {
  if (m.kind === "percent") return Math.round((total * m.value) / 100);
  return Math.round(m.value);
}

export async function POST(req: Request) {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return NextResponse.json({ ok: false, error: "Payments aren't configured yet. Please contact us." }, { status: 500 });
    }

    const { projectId, milestoneId } = await req.json();
    if (!projectId || !milestoneId) return NextResponse.json({ ok: false, error: "Missing project or payment." }, { status: 400 });

    const snap = await getDoc(doc(db, "projects", projectId));
    if (!snap.exists()) return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });

    const project = snap.data() as any;
    const total = project.payment?.total || 0;
    const milestone = (project.payment?.milestones || []).find((m: any) => m.id === milestoneId);
    if (!milestone) return NextResponse.json({ ok: false, error: "Payment not found." }, { status: 404 });
    if (milestone.status === "paid") return NextResponse.json({ ok: false, error: "This payment is already settled." }, { status: 400 });

    const amount = milestoneAmount(milestone, total);
    if (amount <= 0) return NextResponse.json({ ok: false, error: "This payment has no amount due." }, { status: 400 });

    // Create the order via the Razorpay REST API (no SDK dependency needed).
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        amount: amount * 100, // paise
        currency: "INR",
        receipt: `${projectId}_${milestoneId}`.slice(0, 40),
        notes: { projectId, milestoneId },
      }),
    });

    const order = await rzpRes.json();
    if (!rzpRes.ok) {
      console.error("razorpay order error", order);
      return NextResponse.json({ ok: false, error: order?.error?.description || "Couldn't start the payment." }, { status: 502 });
    }

    return NextResponse.json({ ok: true, orderId: order.id, amount: order.amount, currency: order.currency, keyId });
  } catch (e) {
    console.error("order route error", e);
    return NextResponse.json({ ok: false, error: "Internal error." }, { status: 500 });
  }
}
