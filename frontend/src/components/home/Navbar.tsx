import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { Link } from "react-router";
import { useAuth } from "@/hooks/AuthProvider";
import Logo from "@/components/global/Logo";

const Navbar = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`fixed w-full z-50 transition-all duration-300 ${scrolled ? "bg-cream/85 backdrop-blur-md py-3 shadow-[0_1px_0_0_rgba(16,16,20,0.08)]" : "bg-transparent py-5"}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center">
          <Link to="/" className="flex items-center">
            <Logo tone="light" size="md" />
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center space-x-6">
            <a
              href="#home"
              className="text-ink/70 hover:text-ink transition-colors font-medium"
            >
              Overview
            </a>
            <a
              href="#programs"
              className="text-ink/70 hover:text-ink transition-colors font-medium"
            >
              Programs
            </a>
            <a
              href="#stats"
              className="text-ink/70 hover:text-ink transition-colors font-medium"
            >
              Research
            </a>
            <Link
              to={user ? "/dashboard" : "/login"}
              className="text-ink/70 hover:text-ink transition-colors font-medium"
            >
              {user ? "Dashboard" : "Sign In"}
            </Link>
            <Link
              to="/apply"
              className="bg-brand text-white px-6 py-3 rounded-full font-semibold hover:bg-brand-strong transition-colors"
            >
              Apply Now
            </Link>
          </div>

          {/* Mobile button */}
          <div className="md:hidden flex items-center space-x-4">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-ink"
            >
              {isOpen ? (
                <X className="w-8 h-8" />
              ) : (
                <Menu className="w-8 h-8" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-cream border-b border-ink/10 px-4 pt-2 pb-6 space-y-4">
          <a
            href="#home"
            className="block text-ink/70 hover:text-ink text-lg font-medium"
          >
            Overview
          </a>
          <a
            href="#programs"
            className="block text-ink/70 hover:text-ink text-lg font-medium"
          >
            Programs
          </a>
          <a
            href="#stats"
            className="block text-ink/70 hover:text-ink text-lg font-medium"
          >
            Research
          </a>
          <Link
            to={user ? "/dashboard" : "/login"}
            onClick={() => setIsOpen(false)}
            className="block text-ink/70 hover:text-ink text-lg font-medium"
          >
            {user ? "Dashboard" : "Sign In"}
          </Link>
          <Link
            to="/apply"
            onClick={() => setIsOpen(false)}
            className="block w-full bg-brand text-white px-5 py-3 rounded-full font-semibold text-center"
          >
            Apply Now
          </Link>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
