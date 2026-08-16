import colmex from "@/assets/partners/colmex.png";
import peoplebid from "@/assets/partners/peoplebid.png";
import israelInteractive from "@/assets/partners/israel-interactive.png";
import voltaSolar from "@/assets/partners/volta-solar.png";
import yz from "@/assets/partners/yz.png";

const partners = [
  { name: "Colmex Pro", src: colmex },
  { name: "פיפלביז", src: peoplebid },
  { name: "ישראל אינטראקטיב", src: israelInteractive },
  { name: "Volta Solar", src: voltaSolar },
  { name: "YZ", src: yz },
];


const PartnersCarousel = () => {
  const loop = Array(3).fill(partners).flat();

  return (
    <section className="mt-16" aria-labelledby="partners-heading">
      <h2 id="partners-heading" className="text-2xl font-semibold text-foreground mb-6 text-center">
        השותפים שלנו למסע
      </h2>

      <div className="relative overflow-hidden py-2 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]" dir="ltr">
        <div className="flex w-max animate-partners-marquee hover:[animation-play-state:paused] will-change-transform">
          {[0, 1].map((group) => (
            <div key={group} className="flex shrink-0 gap-4 px-2" aria-hidden={group === 1}>
              {loop.map((partner, index) => (
                <div
                  key={`${group}-${partner.name}-${index}`}
                  className="flex h-24 w-44 shrink-0 items-center justify-center rounded-xl border border-border bg-card p-4 shadow-xs transition-shadow hover:shadow-md"
                >
                  <img
                    src={partner.src}
                    alt={group === 0 ? `הלוגו של ${partner.name}` : ""}
                    loading="lazy"
                    className="max-h-14 w-auto max-w-full object-contain"
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PartnersCarousel;
