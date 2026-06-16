import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";

export async function POST(req: Request) {
  try {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) return NextResponse.json({ ok: false, error: "Payments aren't configured." }, { status: 500 });

    const { projectId, milestoneId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();
    if (!projectId || !milestoneId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ ok: false, error: "Missing payment details." }, { status: 400 });
    }

    // Verify the signature: HMAC-SHA256(order_id|payment_id, key_secret).
    const expected = crypto.createHmac("sha256", keySecret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
    if (expected !== razorpay_signature) {
      return NextResponse.json({ ok: false, error: "Signature verification failed." }, { status: 400 });
    }

    // Mark the milestone paid on the project document.
    const ref = doc(db, "projects", projectId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });

    const project = snap.data() as any;
    const milestones = (project.payment?.milestones || []).map((m: any) =>
      m.id === milestoneId ? { ...m, status: "paid", paidAt: Date.now(), razorpayPaymentId: razorpay_payment_id } : m
    );
    await updateDoc(ref, { "payment.milestones": milestones });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("verify route error", e);
    return NextResponse.json({ ok: false, error: "Internal error." }, { status: 500 });
  }
}
