import { ArrowRight, Play } from "lucide-react";
import { Link } from "react-router";

const Hero = () => {
  return (
    <section
      id="home"
      className="relative pt-36 pb-20 bg-cream text-ink overflow-hidden"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 bg-brand-soft px-4 py-1.5 rounded-full text-brand-strong text-sm font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-brand"></span>
              </span>
              <span>2026 admissions are now open</span>
            </div>

            <h1 className="display-xl text-6xl md:text-8xl">
              Learn boldly. <br />
              Graduate <span className="text-brand">ready.</span>
            </h1>

            <p className="text-xl text-ink/70 max-w-lg">
              Veya is a technology-driven university built for the next
              generation of innovators, engineers, and digital artists.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              <Link
                to="/apply"
                className="inline-flex items-center justify-center gap-2 bg-brand text-white px-8 py-4 rounded-full font-semibold hover:bg-brand-strong transition-colors"
              >
                <span>Start application</span>
                <ArrowRight className="w-5 h-5" />
              </Link>
              <a
                href="#programs"
                className="inline-flex items-center justify-center gap-2 border border-ink/20 text-ink px-8 py-4 rounded-full font-semibold hover:bg-ink hover:text-cream transition-colors"
              >
                <Play className="w-4 h-4" />
                <span>Explore programs</span>
              </a>
            </div>

            <div className="flex items-center gap-10 pt-6 border-t border-ink/10">
              {[
                { value: "12k+", label: "Active students" },
                { value: "98%", label: "Graduate hire rate" },
                { value: "#1", label: "Tech innovation" },
              ].map((stat) => (
                <div key={stat.label}>
                  <p className="display-xl text-4xl">{stat.value}</p>
                  <p className="text-sm text-ink/60 mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="relative rounded-[2rem] overflow-hidden shadow-[0_24px_60px_-24px_rgba(16,16,20,0.45)]">
              <img
                src="https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&q=80&w=1200"
                alt="Veya campus"
                className="w-full h-auto object-cover"
              />
            </div>

            <div className="absolute -bottom-8 -left-6 max-w-xs bg-white rounded-[1.5rem] p-6 shadow-[0_18px_40px_-20px_rgba(16,16,20,0.5)] hidden md:block">
              <p className="text-xs font-semibold text-brand uppercase tracking-widest mb-2">
                Upcoming event
              </p>
              <p className="text-lg font-semibold">Quantum Computing Workshop</p>
              <p className="text-sm text-ink/60 mt-1">
                April 15 — an exclusive look into the future.
              </p>
            </div>

            <div className="absolute -top-6 -right-4 bg-brand text-white rounded-[1.5rem] px-6 py-5 hidden md:block">
              <p className="display-xl text-3xl">250+</p>
              <p className="text-sm opacity-80">Research labs</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
