"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { T, NAV } from "@/lib/theme";
import { Container, Btn, ArrowR } from "@/components/ui/Shared";

export function Navbar() {
  const [open, setOpen] = useState(false); 
  const [sc, setSc] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => { 
    const on = () => setSc(window.scrollY > 12); 
    on(); 
    window.addEventListener("scroll", on); 
    return () => window.removeEventListener("scroll", on); 
  }, []);
  
  useEffect(() => { setOpen(false); }, [pathname]);

  if (pathname?.startsWith("/portal")) return null;

  return (
    <header style={{ position: "sticky", top: 0, zIndex: 50, background: sc ? "rgba(252,251,248,.85)" : "transparent", backdropFilter: sc ? "blur(14px)" : "none", borderBottom: `1px solid ${sc ? T.line : "transparent"}`, transition: "all .35s" }}>
      <Container style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 72 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img style={{ width: "140px" }} src="/logo.png" alt="Logo" />
        </Link>
        <nav className="ol-dnav" style={{ display: "flex", alignItems: "center", gap: 26 }}>
          {NAV.slice(1).map((n) => { 
            const a = pathname === n.to; 
            return (
              <Link key={n.to} href={n.to} className="ol-uline" style={{ fontSize: 14.5, fontWeight: a ? 600 : 400, color: a ? T.ink : T.mute, fontFamily: "'Poppins',sans-serif" }}>
                {n.label}
              </Link>
            ); 
          })}
          <Btn variant="coral" onClick={() => router.push("/book")} style={{ padding: "11px 20px", fontSize: 14, borderRadius: 10 }}>Book a free call</Btn>
        </nav>
        
        {/* Mobile Burg */}
        <button className="ol-burg" onClick={() => setOpen((o) => !o)} aria-label="Menu" style={{ display: "none", background: "none", border: "none", width: 40, height: 40, position: "relative" }}>
          <span style={{ position: "absolute", left: 8, right: 8, height: 2, background: T.ink, top: open ? 19 : 14, transform: open ? "rotate(45deg)" : "none", transition: "all .3s" }} />
          <span style={{ position: "absolute", left: 8, right: 8, height: 2, background: T.ink, top: 19, opacity: open ? 0 : 1, transition: "all .3s" }} />
          <span style={{ position: "absolute", left: 8, right: 8, height: 2, background: T.ink, top: open ? 19 : 24, transform: open ? "rotate(-45deg)" : "none", transition: "all .3s" }} />
        </button>
      </Container>
      
      {/* Mobile Nav Dropdown */}
      <div style={{ overflow: "hidden", maxHeight: open ? 540 : 0, transition: "max-height .42s cubic-bezier(.2,.7,.2,1)", background: "rgba(252,251,248,.98)", backdropFilter: "blur(14px)", borderBottom: open ? `1px solid ${T.line}` : "none" }}>
        <Container style={{ padding: "8px 24px 22px" }}>
          {NAV.map((n, i) => (
            <Link key={n.to} href={n.to} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", borderBottom: `1px solid ${T.line}`, padding: "16px 2px", fontSize: 17, fontWeight: pathname === n.to ? 600 : 400, color: T.ink, fontFamily: "'Poppins',sans-serif" }}>
              {n.label}
              <span className="ol-mono" style={{ fontSize: 12, color: T.faint }}>0{i + 1}</span>
            </Link>
          ))}
          <Btn variant="coral" onClick={() => router.push("/book")} style={{ marginTop: 18, width: "100%" }}>Book a free call <ArrowR /></Btn>
        </Container>
      </div>
      <style>{`@media(max-width:920px){.ol-dnav{display:none !important;}.ol-burg{display:block !important;}}`}</style>
    </header>
  );
}