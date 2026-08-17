import { useState } from "react";
import { Menu, X, Search } from "lucide-react";
import { useCategories } from "@/hooks/useCategories";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "@/lib/router-compat";
import { Briefcase, Wrench, GraduationCap } from "lucide-react";
import wordmark from "@/assets/agendax-wordmark.png";
import SearchDialog from "./SearchDialog";

interface HeaderProps {
  activeCategory?: string;
  onCategoryChange?: (slug: string) => void;
}

// Nav items share one shape so the desktop row and the mobile sheet cannot
// drift apart when a link is added.
const navItemBase =
  "relative px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200";
const navItemIdle = "text-foreground/70 hover:text-foreground hover:bg-secondary";
const navItemActive = "text-primary";

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

  const secondaryLinks = [
    settings.show_jobs && { to: "/jobs", label: "איזור התעסוקה", Icon: Briefcase },
    settings.show_courses && { to: "/courses", label: "קורסים והרצאות", Icon: GraduationCap },
    { to: "/toolbox", label: "ארגז הכלים", Icon: Wrench },
  ].filter(Boolean) as { to: string; label: string; Icon: typeof Briefcase }[];

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur shadow-nav" role="banner">
      {/* Utility strip — the only navy on the page above the fold, so the
          wordmark below it gets a clean light surface to sit on. */}
      <div className="bg-primary text-primary-foreground">
        <div className="container flex items-center justify-between py-1.5 text-xs">
          <span className="text-primary-foreground/70">
            {new Date().toLocaleDateString("he-IL", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
          <button
            onClick={() => setSearchOpen(true)}
            aria-label="חיפוש"
            className="hidden md:flex items-center gap-1.5 text-primary-foreground/70 hover:text-primary-foreground transition-colors"
          >
            <Search className="w-3.5 h-3.5" />
            חיפוש
          </button>
        </div>
      </div>

      <div className="container">
        <div className="flex items-center justify-between gap-6 py-3">
          <Link to="/" aria-label="Agendax — לדף הבית">
            <motion.img
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              src={wordmark}
              alt="Agendax"
              width={800}
              height={107}
              className="h-7 md:h-8 w-auto"
            />
          </Link>

          <nav className="hidden md:flex items-center gap-0.5" aria-label="ניווט ראשי">
            {categories.map((category) => {
              const isActive = activeCategory === category.slug;
              return (
                <button
                  key={category.slug}
                  onClick={() => handleCategoryClick(category.slug)}
                  className={`${navItemBase} ${isActive ? navItemActive : navItemIdle}`}
                >
                  {category.name}
                  {isActive && (
                    <motion.span
                      layoutId="nav-underline"
                      className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-gradient-brand"
                    />
                  )}
                </button>
              );
            })}

            <span className="mx-2 h-5 w-px bg-border" aria-hidden="true" />

            {secondaryLinks.map(({ to, label, Icon }) => (
              <Link key={to} to={to} className={`${navItemBase} ${navItemIdle} flex items-center gap-1.5`}>
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="md:hidden flex items-center gap-1">
            <button onClick={() => setSearchOpen(true)} aria-label="חיפוש" className="p-2 text-foreground">
              <Search className="w-5 h-5" />
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "סגור תפריט" : "פתח תפריט"}
              aria-expanded={mobileMenuOpen}
              className="p-2 text-foreground"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* The logo's X, unrolled into a hairline. */}
      <div className="h-0.5 bg-gradient-brand" aria-hidden="true" />

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.nav
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-background border-b border-border overflow-hidden"
          >
            <div className="container py-3 flex flex-col gap-1">
              {categories.map((category) => (
                <button
                  key={category.slug}
                  onClick={() => {
                    handleCategoryClick(category.slug);
                    setMobileMenuOpen(false);
                  }}
                  className={`px-3 py-2.5 rounded-lg text-right font-medium transition-colors ${
                    activeCategory === category.slug
                      ? "bg-secondary text-primary"
                      : "text-foreground/70 hover:bg-secondary"
                  }`}
                >
                  {category.name}
                </button>
              ))}

              <span className="my-1 h-px bg-border" aria-hidden="true" />

              {secondaryLinks.map(({ to, label, Icon }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-3 py-2.5 rounded-lg text-right font-medium transition-colors text-foreground/70 hover:bg-secondary flex items-center gap-2"
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              ))}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
};

export default Header;
