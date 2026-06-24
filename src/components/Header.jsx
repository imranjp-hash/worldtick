import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Header = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  const navLinks = [
    { label: 'Home', path: '/' },
    { label: 'Browse Cities', path: '/cities' },
    { label: 'Browse Countries', path: '/countries' },
    { label: 'Time Difference', path: '/time-difference' },
    { label: 'About', path: '/about' },
  ];

  const getLinkClass = (path) => {
    const isActive = location.pathname === path;

    return isActive
      ? 'text-white font-semibold border-b-2 border-blue-400 pb-1'
      : 'text-slate-300 hover:text-white font-medium transition-colors duration-300';
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-[#0F172A]/85 backdrop-blur-md">
      <div className="mobileHeaderShell w-full px-4 md:px-6 lg:px-8 py-5 md:py-6">
        <div className="mobileHeaderRow flex items-center justify-between gap-4">
          <button
  className="mobileHeaderButton flex items-center justify-center text-slate-300 hover:text-white transition p-2"
  onClick={() => setMenuOpen(!menuOpen)}
  aria-label="Toggle menu"
  aria-expanded={menuOpen}
>
            {menuOpen ? <X size={28} /> : <Menu size={28} />}
          </button>
          <Link
            to="/"
            onClick={() => setMenuOpen(false)}
            className="flex items-center hover:opacity-90 transition-opacity duration-300"
            aria-label="WorldTick Home"
          >
            <img
              src="https://res.cloudinary.com/dguinb6up/image/upload/v1775780861/worldtick-logo-premium_dkh2gu.svg"
              alt="WorldTick"
              className="worldtickHeaderLogo h-14 sm:h-16 md:h-20 lg:h-[88px] w-auto object-contain transition-all duration-300 hover:scale-105"
            />
          </Link>
<nav
  className="desktopHeaderNav"
  style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "38px",
    marginLeft: "80px",
    flex: 1,
  }}
>
            {navLinks.map((link) => (
              <Link
  key={link.path}
  to={link.path}
  className={getLinkClass(link.path)}
style={{
  textDecoration: "none",
  whiteSpace: "nowrap",
  color: location.pathname === link.path ? "#67e8f9" : "#e5edf7",
  fontSize: "21px",
fontWeight: 900,
textShadow: "0 0 10px rgba(103,232,249,0.15)",
  letterSpacing: "0.03em",
  padding: "8px 4px",
  borderBottom:
    location.pathname === link.path
      ? "2px solid #67e8f9"
      : "2px solid transparent",
  transition: "all 0.25s ease",
}}
>
                {link.label}
              </Link>
            ))}
          </nav>

          
        </div>

        <AnimatePresence>
  {menuOpen && (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.45 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={() => setMenuOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          background: "black",
          zIndex: 40,
        }}
      />

      <motion.div
        initial={{ x: "-100%" }}
        animate={{ x: 0 }}
        exit={{ x: "-100%" }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          height: "100vh",
          width: "min(320px, 84vw)",
          background: "#071120",
          borderRight: "1px solid rgba(255,255,255,0.1)",
          padding: "76px 20px 24px",
          zIndex: 60,
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        <div style={{ marginBottom: "28px" }}>
          <img
            src="https://res.cloudinary.com/dguinb6up/image/upload/v1775780861/worldtick-logo-premium_dkh2gu.svg"
            alt="WorldTick"
            style={{
  display: "block",
  width: "min(184px, 100%)",
  height: "auto",
}}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              onClick={() => setMenuOpen(false)}
              style={{
                color: "white",
                textDecoration: "none",
                fontSize: "1.22rem",
fontWeight: 700,
              }}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </motion.div>
    </>
  )}
</AnimatePresence>
      </div>
      <style>{`
  .desktopHeaderNav {
    display: flex !important;
  }

  .mobileHeaderButton {
    display: none !important;
    position: relative;
    z-index: 70;
    min-width: 44px;
    min-height: 44px;
    border-radius: 999px;
  }

  .mobileHeaderRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  @media (max-width: 900px) {
    .mobileHeaderShell {
      padding-top: 10px !important;
      padding-bottom: 10px !important;
    }

    .worldtickHeaderLogo {
      width: min(220px, calc(100vw - 104px)) !important;
      height: auto !important;
      max-height: 42px;
    }

    .desktopHeaderNav {
      display: none !important;
    }

    .mobileHeaderButton {
      display: flex !important;
    }
  }

  @media (max-width: 360px) {
    .mobileHeaderShell {
      padding-left: 12px !important;
      padding-right: 12px !important;
    }

    .worldtickHeaderLogo {
      width: min(208px, calc(100vw - 92px)) !important;
      height: auto !important;
      max-height: 40px;
    }
  }
`}</style>
    </header>
  );
};

export default Header;
