import Header from "@/components/Header";

/**
 * Loading skeletons that keep the page's real structure — chrome, columns,
 * card grid — so the load reads as "the content is arriving" instead of a
 * blank screen with a spinner, and nothing jumps when the data lands (the
 * skeleton occupies the same boxes the content will).
 *
 * animate-pulse collapses to a static placeholder under prefers-reduced-motion
 * via the global media rule.
 */

const shimmer = "bg-surface-1/70 animate-pulse";

const CardSkeleton = () => (
  <div className={`aspect-4/5 rounded-xl ${shimmer}`} aria-hidden="true" />
);

const SidebarSkeleton = () => (
  <div className="space-y-8" aria-hidden="true">
    <div className={`h-72 rounded-xl ${shimmer}`} />
    <div className={`h-44 rounded-xl ${shimmer}`} />
  </div>
);

/** Homepage while articles load: hero band, card grid, sidebar. */
export const HomeSkeleton = () => (
  <div className="min-h-screen bg-background">
    <Header />
    <main className="container py-8" aria-busy="true" aria-label="טוען תוכן">
      <div className={`rounded-2xl aspect-[4/3] sm:aspect-[21/8] mb-8 ${shimmer}`} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className={`h-7 w-40 rounded-md mb-6 ${shimmer}`} />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }, (_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        </div>
        <SidebarSkeleton />
      </div>
    </main>
  </div>
);

/** Article page while it loads: hero band, then the reading card with text lines. */
export const ArticleSkeleton = () => (
  <div className="min-h-screen bg-background">
    <Header />
    <main aria-busy="true" aria-label="טוען כתבה">
      <div className={`h-[40vh] md:h-[50vh] ${shimmer}`} />
      <div className="container mx-auto px-4 -mt-32 relative z-10 pb-16">
        <div className="max-w-4xl mx-auto bg-card rounded-2xl shadow-hover p-6 md:p-10">
          <div className={`h-5 w-24 rounded-full mb-6 ${shimmer}`} />
          <div className={`h-9 w-4/5 rounded-md mb-3 ${shimmer}`} />
          <div className={`h-9 w-3/5 rounded-md mb-8 ${shimmer}`} />
          <div className="mx-auto max-w-[70ch] space-y-3">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className={`h-4 rounded ${shimmer} ${i % 3 === 2 ? "w-2/3" : "w-full"}`} />
            ))}
          </div>
        </div>
      </div>
    </main>
  </div>
);

/** Category page while articles load: title bar, card grid, sidebar. */
export const CategorySkeleton = () => (
  <div className="min-h-screen bg-background">
    <Header />
    <main className="container py-8" aria-busy="true" aria-label="טוען תוכן">
      <div className="mb-8">
        <div className={`h-9 w-48 rounded-md ${shimmer}`} />
        <div className="mt-3 h-0.5 w-16 bg-gradient-brand rounded-full" aria-hidden="true" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
        <SidebarSkeleton />
      </div>
    </main>
  </div>
);
