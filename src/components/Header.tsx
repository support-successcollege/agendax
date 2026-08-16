import { useState } from "react";
import { Menu, X, Search } from "lucide-react";
import { useCategories } from "@/hooks/useCategories";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "@/lib/router-compat";
import { Briefcase, Wrench, GraduationCap } from "lucide-react";
import logo from "@/assets/logo.png";
import SearchDialog from "./SearchDialog";

interface HeaderProps {
  activeCategory?: string;
  onCategoryChange?: (slug: string) => void;
}

const Header = ({ activeCategory = "home", onCategoryChange }: HeaderProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();
  const { categories } = useCategories();
  const { settings } = useSiteSettings();

  const handleCategoryClick = (slug: string) => {
    if (onCategoryChange) {
      onCategoryChange(slug);
    } else {
      navigate(`/?category=${slug}`);
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-primary shadow-nav" role="banner">
      {/* Top bar with date */}
      <div className="bg-primary/90 border-b border-primary-foreground/10">
        <div className="container py-2">
          <div className="flex items-center justify-between text-primary-foreground/70 text-sm">
            <span>{new Date().toLocaleDateString("he-IL", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span>
            <div className="hidden md:flex items-center gap-4">
              <button 
                onClick={() => setSearchOpen(true)}
                aria-label="חיפוש"
                className="hover:text-primary-foreground transition-colors"
              >
                <Search className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main header */}
      <div className="container py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link to="/">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center"
            >
              <div className="bg-white rounded-lg p-1">
                <img src={logo} alt="YZ News" width={48} height={48} className="h-12 w-auto" />
              </div>
            </motion.div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1" aria-label="ניווט ראשי">
            {categories.map((category) => (
              <button
                key={category.slug}
                onClick={() => handleCategoryClick(category.slug)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeCategory === category.slug
                    ? "bg-primary-foreground text-primary"
                    : "text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground"
                }`}
              >
                {category.name}
              </button>
            ))}
            {settings.show_jobs && (
              <Link
                to="/jobs"
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground flex items-center gap-1"
              >
                <Briefcase className="w-4 h-4" />
                איזור התעסוקה
              </Link>
            )}
            {settings.show_courses && (
              <Link
                to="/courses"
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground flex items-center gap-1"
              >
                <GraduationCap className="w-4 h-4" />
                קורסים והרצאות
              </Link>
            )}
            <Link
              to="/toolbox"
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground flex items-center gap-1"
            >
              <Wrench className="w-4 h-4" />
              ארגז הכלים
            </Link>
          </nav>

          {/* Mobile buttons - Search and Menu */}
          <div className="md:hidden flex items-center gap-2">
            <button
              onClick={() => setSearchOpen(true)}
              aria-label="חיפוש"
              className="p-2 text-primary-foreground"
            >
              <Search className="w-6 h-6" />
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "סגור תפריט" : "פתח תפריט"}
              aria-expanded={mobileMenuOpen}
              className="p-2 text-primary-foreground"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.nav
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-primary border-t border-primary-foreground/10 overflow-hidden"
          >
            <div className="container py-4 flex flex-col gap-2">
              {categories.map((category) => (
                <button
                  key={category.slug}
                  onClick={() => {
                    handleCategoryClick(category.slug);
                    setMobileMenuOpen(false);
                  }}
                  className={`px-4 py-3 rounded-lg text-right font-medium transition-all ${
                    activeCategory === category.slug
                      ? "bg-primary-foreground text-primary"
                      : "text-primary-foreground/80 hover:bg-primary-foreground/10"
                  }`}
                >
                  {category.name}
                </button>
              ))}
              {settings.show_jobs && (
                <Link
                  to="/jobs"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-4 py-3 rounded-lg text-right font-medium transition-all text-primary-foreground/80 hover:bg-primary-foreground/10 flex items-center gap-2"
                >
                  <Briefcase className="w-4 h-4" />
                  איזור התעסוקה
                </Link>
              )}
              {settings.show_courses && (
                <Link
                  to="/courses"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-4 py-3 rounded-lg text-right font-medium transition-all text-primary-foreground/80 hover:bg-primary-foreground/10 flex items-center gap-2"
                >
                  <GraduationCap className="w-4 h-4" />
                  קורסים והרצאות
                </Link>
              )}
              <Link
                to="/toolbox"
                onClick={() => setMobileMenuOpen(false)}
                className="px-4 py-3 rounded-lg text-right font-medium transition-all text-primary-foreground/80 hover:bg-primary-foreground/10 flex items-center gap-2"
              >
                <Wrench className="w-4 h-4" />
                ארגז הכלים
              </Link>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
};

export default Header;
