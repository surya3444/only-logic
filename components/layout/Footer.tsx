"use client";
import React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { T, NAV } from "@/lib/theme";
import { Container, Btn, ArrowR } from "@/components/ui/Shared";

export function Footer() {
  const router = useRouter();
  const pathname = usePathname();
  if (pathname?.startsWith("/portal")) return null;
  return (
    <footer style={{ background: T.ink, color: "#EDEEF2" }}>
      <Container style={{ padding: "72px 24px 36px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1.2fr", gap: 40 }} className="ol-fg">
          <div>
            <img style={{ width: "140px", fontWeight: 700, fontSize: 22, marginBottom: 14, color: "#fff" }} src="/logo1.png" alt="Logo" />
            <p style={{ color: "#A6ABB8", maxWidth: 330, lineHeight: 1.65, fontSize: 15, margin: 0 }}>We build websites, apps, AI automations and internal tools — around how your business actually works.</p>
            <div className="ol-mono" style={{ marginTop: 20, fontSize: 13, color: T.coral }}>Find the logic. Build the solution.</div>
          </div>
          <div>
            <div className="ol-mono" style={{ fontSize: 12, letterSpacing: ".12em", color: "#71768A", textTransform: "uppercase", marginBottom: 16 }}>Explore</div>
            {[...NAV, { to: "/book", label: "Book a call" }].map((n) => <Link key={n.to} href={n.to} style={{ display: "block", color: "#A6ABB8", padding: "7px 0", fontSize: 15, textAlign: "left" }} onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")} onMouseLeave={(e) => (e.currentTarget.style.color = "#A6ABB8")}>{n.label}</Link>)}
          </div>
          <div>
            <div className="ol-mono" style={{ fontSize: 12, letterSpacing: ".12em", color: "#71768A", textTransform: "uppercase", marginBottom: 16 }}>Start here</div>
            <p style={{ color: "#A6ABB8", fontSize: 15, lineHeight: 1.6, marginTop: 0 }}>Tell us what's slowing you down. We'll tell you what to build — free, in 30 minutes.</p>
            <Btn variant="coral" onClick={() => router.push("/book")} style={{ marginTop: 4 }}>Book a free call <ArrowR /></Btn>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 56, paddingTop: 24, borderTop: "1px solid #2A3047", flexWrap: "wrap", gap: 12 }}>
          <span className="ol-mono" style={{ fontSize: 13, color: "#71768A" }}>© {new Date().getFullYear()} Only Logic — Business Systems Studio</span>
          <span className="ol-mono" style={{ fontSize: 13, color: "#71768A" }}>Built around your logic.</span>
        </div>
      </Container>
      <style>{`@media(max-width:780px){.ol-fg{grid-template-columns:1fr !important;gap:36px !important;}}`}</style>
    </footer>
  );
}