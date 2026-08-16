import { useState } from "react";
import { Link } from "@/lib/router-compat";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCourses } from "@/hooks/useCourses";
import { useEvents } from "@/hooks/useEvents";
import { useProducts, Product } from "@/hooks/useProducts";
import ProductInquiryDialog from "@/components/ProductInquiryDialog";
import { GraduationCap, Calendar, Clock, MapPin, User, Tag, ShoppingBag, ExternalLink, Mail } from "lucide-react";
import CourseAccountMenu from "@/components/CourseAccountMenu";

const formatPrice = (p: number, currency = "ILS") =>
  p === 0 ? "חינם" : new Intl.NumberFormat("he-IL", { style: "currency", currency, maximumFractionDigits: 0 }).format(p);

const Courses = () => {
  const { courses, isLoading: cLoading } = useCourses({ onlyPublished: true });
  const { events, isLoading: eLoading } = useEvents({ onlyPublished: true, upcoming: true });
  const { products, isLoading: pLoading } = useProducts({ onlyActive: true });
  const [inquiryProduct, setInquiryProduct] = useState<Product | null>(null);

  return (
    <div className="min-h-screen flex flex-col bg-background">

      <Header />

      <main id="main-content" className="container py-10 flex-1">
        <div className="flex justify-end mb-4">
          <CourseAccountMenu />
        </div>

        <section className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-bold mb-3 flex items-center justify-center gap-3">
            <GraduationCap className="w-10 h-10 text-primary" />
            קורסים והרצאות
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            למידה מעמיקה ממומחי תוכן מהשורה הראשונה. צפו בשיעור הראשון בחינם בכל קורס.
          </p>
        </section>

        {/* Upcoming events */}
        <section className="mb-14">
          <h2 className="text-2xl font-bold mb-5 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-primary" /> אירועים קרובים
          </h2>
          {eLoading ? (
            <p className="text-muted-foreground">טוען...</p>
          ) : events.length === 0 ? (
            <p className="text-muted-foreground">אין כרגע אירועים מתוכננים.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {events.map((e) => (
                <Link key={e.id} to={`/events/${e.slug}`} className="group">
                  <Card className="overflow-hidden h-full hover:shadow-lg transition-all">
                    {e.cover_image_url && (
                      <div className="aspect-video overflow-hidden bg-muted">
                        <img src={e.cover_image_url} alt={e.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      </div>
                    )}
                    <CardContent className="p-5 space-y-2">
                      <Badge variant="secondary" className="gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(e.event_date).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}
                        {e.event_time ? ` · ${e.event_time.slice(0, 5)}` : ""}
                      </Badge>
                      <h3 className="text-lg font-bold group-hover:text-primary transition-colors">{e.title}</h3>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                        {e.speaker_name && (<span className="flex items-center gap-1"><User className="w-3 h-3" />{e.speaker_name}</span>)}
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{e.location_type === "online" ? "אונליין" : e.location || "פרונטלי"}</span>
                      </div>
                      <div className="pt-2 flex items-center justify-between">
                        <span className="font-bold text-primary">{formatPrice(e.price)}</span>
                        <Button size="sm" variant="outline">פרטים והרשמה</Button>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Courses */}
        <section>
          <h2 className="text-2xl font-bold mb-5 flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-primary" /> כל הקורסים
          </h2>
          {cLoading ? (
            <p className="text-muted-foreground">טוען...</p>
          ) : courses.length === 0 ? (
            <p className="text-muted-foreground">אין כרגע קורסים זמינים.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {courses.map((c) => (
                <Link key={c.id} to={`/courses/${c.slug}`} className="group">
                  <Card className="overflow-hidden h-full hover:shadow-lg transition-all">
                    {c.cover_image_url && (
                      <div className="aspect-video overflow-hidden bg-muted">
                        <img src={c.cover_image_url} alt={c.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      </div>
                    )}
                    <CardContent className="p-5 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {c.category && <Badge variant="secondary" className="gap-1"><Tag className="w-3 h-3" />{c.category}</Badge>}
                        {c.level && <Badge variant="outline">{c.level}</Badge>}
                      </div>
                      <h3 className="text-lg font-bold group-hover:text-primary transition-colors line-clamp-2">{c.title}</h3>
                      {c.short_description && (<p className="text-sm text-muted-foreground line-clamp-2">{c.short_description}</p>)}
                      <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                        {c.instructor_name && (<span className="flex items-center gap-1"><User className="w-3 h-3" />{c.instructor_name}</span>)}
                        {c.duration_hours && (<span className="flex items-center gap-1"><Clock className="w-3 h-3" />{c.duration_hours} ש'</span>)}
                      </div>
                      <div className="pt-2 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-primary text-lg">{formatPrice(Number(c.price), c.currency)}</span>
                          {c.original_price && Number(c.original_price) > Number(c.price) && (
                            <span className="text-xs text-muted-foreground line-through mr-2">{formatPrice(Number(c.original_price), c.currency)}</span>
                          )}
                        </div>
                        <Button size="sm">צפה בקורס</Button>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Products */}
        <section className="mt-14">
          <h2 className="text-2xl font-bold mb-5 flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-primary" /> פריטים למכירה
          </h2>
          {pLoading ? (
            <p className="text-muted-foreground">טוען...</p>
          ) : products.length === 0 ? (
            <p className="text-muted-foreground">אין כרגע פריטים זמינים.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {products.map((p) => (
                <Card key={p.id} className="overflow-hidden h-full flex flex-col">
                  {p.image_url && (
                    <div className="aspect-video overflow-hidden bg-muted">
                      <img src={p.image_url} alt={p.title} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                  )}
                  <CardContent className="p-5 space-y-2 flex-1 flex flex-col">
                    <h3 className="text-lg font-bold">{p.title}</h3>
                    {p.description && <p className="text-sm text-muted-foreground line-clamp-3 flex-1">{p.description}</p>}
                    {p.price != null && <div className="font-bold text-primary text-lg">{formatPrice(Number(p.price), p.currency)}</div>}
                    <div className="flex gap-2 pt-2 flex-wrap">
                      {p.external_checkout_url && (
                        <Button asChild size="sm" className="gap-1">
                          <a href={p.external_checkout_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3 h-3" />רכישה מהירה</a>
                        </Button>
                      )}
                      {p.enable_inquiry && (
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => setInquiryProduct(p)}>
                          <Mail className="w-3 h-3" />השאר פרטים
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>

      <ProductInquiryDialog product={inquiryProduct} open={!!inquiryProduct} onOpenChange={(o) => !o && setInquiryProduct(null)} />
      <Footer />
    </div>
  );
};

export default Courses;
