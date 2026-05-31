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
    { label: 'About', path: '/about' },
    { label: 'Contact', path: '/contact' },
    { label: 'Privacy', path: '/privacy' },
    { label: 'Terms', path: '/terms' },
  ];

  const getLinkClass = (path) => {
    const isActive = location.pathname === path;

    return isActive
      ? 'text-white font-semibold border-b-2 border-blue-400 pb-1'
      : 'text-slate-300 hover:text-white font-medium transition-colors duration-300';
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-[#0F172A]/85 backdrop-blur-md">
      <div className="w-full px-4 md:px-6 lg:px-8 py-5 md:py-6">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            onClick={() => setMenuOpen(false)}
            className="flex items-center hover:opacity-90 transition-opacity duration-300"
            aria-label="WorldTick Home"
          >
            <img
              src="https://res.cloudinary.com/dguinb6up/image/upload/v1775780861/worldtick-logo-premium_dkh2gu.svg"
              alt="WorldTick"
              className="h-14 sm:h-16 md:h-20 lg:h-[88px] w-auto object-contain transition-all duration-300 hover:scale-105"
            />
          </Link>

          <nav className="hidden md:flex items-center gap-6 lg:gap-8 text-base lg:text-lg">
            {navLinks.map((link) => (
              <Link key={link.path} to={link.path} className={getLinkClass(link.path)}>
                {link.label}
              </Link>
            ))}
          </nav>

          <button
            className="md:hidden text-slate-300 hover:text-white transition"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X size={28} /> : <Menu size={28} />}
          </button>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -12, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -12, height: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="md:hidden overflow-hidden"
            >
              <div className="mt-4 w-full bg-[#0F172A]/95 border-t border-white/10 px-6 py-6 space-y-6 text-center backdrop-blur-md shadow-xl">
                {navLinks.map((link) => (
                  <Link
                    key={link.path}
                    to={link.path}
                    onClick={() => setMenuOpen(false)}
                    className={`block text-lg ${getLinkClass(link.path)}`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
};

export default Header;