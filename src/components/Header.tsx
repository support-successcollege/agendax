import { useState } from "react";
import { Menu, X, Search } from "lucide-react";
import { useCategories } from "@/hooks/useCategories";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation } from "@/lib/router-compat";
import { Briefcase, GraduationCap } from "lucide-react";
import wordmark from "@/assets/agendax-wordmark-light.png";
import SearchDialog from "./SearchDialog";

// Every category is its own page. The link target for "home" is the homepage;
// everything else lives under /category/<slug>.
const categoryPath = (slug: string) =>
  slug === "home" ? "/" : `/category/${encodeURIComponent(slug)}`;

// Nav items share one shape so the desktop row and the mobile sheet cannot
// drift apart when a link is added.
const navItemBase =
  "press relative px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200";
const navItemIdle = "text-foreground/70 hover:text-foreground hover:bg-surface-2";
const navItemActive = "text-primary";

const Header = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  const { categories } = useCategories();
  const { settings } = useSiteSettings();

  // Active state comes from the URL, so the header needs no props and every
  // page that renders it gets correct highlighting for free.
  const activeCategory =
    location.pathname === "/"
      ? "home"
      : decodeURIComponent(location.pathname.match(/^\/category\/([^/]+)/)?.[1] ?? "");

  const secondaryLinks = [
    settings.show_jobs && { to: "/jobs", label: "איזור התעסוקה", Icon: Briefcase },
    settings.show_courses && { to: "/courses", label: "קורסים והרצאות", Icon: GraduationCap },
  ].filter(Boolean) as { to: string; label: string; Icon: typeof Briefcase }[];

  return (
    // Translucent chrome the page scrolls under, rather than an opaque strip
    // that permanently eats a band of the viewport.
    <header className="sticky top-0 z-50 glass shadow-nav" role="banner">
      {/* Utility strip — recedes into the deepest surface so the wordmark below
          it is the first thing with any weight. */}
      <div className="bg-surface-deep/60 text-muted-foreground">
        <div className="container flex items-center justify-between py-1.5">
          <span className="type-label-mono text-muted-foreground/70 normal-case">
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
            className="press hidden md:flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-primary"
          >
            <Search className="w-3.5 h-3.5" />
            חיפוש
          </button>
        </div>
      </div>

      <div className="container">
        <div className="flex items-center justify-between gap-6 py-3">
          <Link to="/" aria-label="Agendax — לדף הבית" className="press">
            <motion.img
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
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
                <Link
                  key={category.slug}
                  to={categoryPath(category.slug)}
                  className={`${navItemBase} ${isActive ? navItemActive : navItemIdle}`}
                >
                  {category.name}
                  {isActive && (
                    <motion.span
                      layoutId="nav-underline"
                      // Critically damped: the underline is chasing a click, not
                      // a flick, so overshoot would read as noise.
                      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                      className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-gradient-brand shadow-glow"
                    />
                  )}
                </Link>
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
            // Enters and leaves along the same path, so it reads as the same
            // panel returning rather than a new one appearing.
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="md:hidden glass border-b border-border overflow-hidden"
          >
            <div className="container py-3 flex flex-col gap-1">
              {categories.map((category) => (
                <Link
                  key={category.slug}
                  to={categoryPath(category.slug)}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`press px-3 py-2.5 rounded-lg text-right font-medium transition-colors ${
                    activeCategory === category.slug
                      ? "bg-surface-2 text-primary"
                      : "text-foreground/70 hover:bg-surface-2"
                  }`}
                >
                  {category.name}
                </Link>
              ))}

              <span className="my-1 h-px bg-border" aria-hidden="true" />

              {secondaryLinks.map(({ to, label, Icon }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMobileMenuOpen(false)}
                  className="press px-3 py-2.5 rounded-lg text-right font-medium transition-colors text-foreground/70 hover:bg-surface-2 flex items-center gap-2"
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
