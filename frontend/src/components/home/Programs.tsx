import { Link } from "react-router";
import {
  ArrowRight,
  Brain,
  Cpu,
  Database,
  Palette,
  ShieldCheck,
} from "lucide-react";

const programs = [
  {
    title: "Computer Science",
    icon: Cpu,
    desc: "Master the foundations of software engineering and scalable systems.",
    tags: ["AI", "Systems", "Mobile"],
  },
  {
    title: "Neural Engineering",
    icon: Brain,
    desc: "The intersection of neuroscience and computational modeling.",
    tags: ["Biotech", "BCI", "Research"],
  },
  {
    title: "Data Architecture",
    icon: Database,
    desc: "Design complex data systems for global enterprises.",
    tags: ["Big Data", "Cloud", "SQL"],
  },
  {
    title: "Digital Arts",
    icon: Palette,
    desc: "Bridge the gap between technology and creative expression.",
    tags: ["UI/UX", "3D", "VFX"],
  },
  {
    title: "Cyber Security",
    icon: ShieldCheck,
    desc: "Protect the digital frontier with advanced offensive/defensive tactics.",
    tags: ["Ethical Hacking", "Crypto"],
  },
];

const Programs = () => {
  return (
    <section id="programs" className="py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
          <div className="space-y-4">
            <h2 className="text-brand font-semibold tracking-widest uppercase text-sm">
              Academic programs
            </h2>
            <h3 className="display-xl text-5xl md:text-6xl">Find your domain</h3>
          </div>
          <p className="text-ink/60 max-w-md">
            Our curriculum is designed in partnership with industry giants to
            ensure our graduates are day-one ready.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {programs.map((program, idx) => (
            <div
              key={idx}
              className="group relative bg-white p-8 rounded-[2rem] transition-shadow duration-300 shadow-[0_10px_30px_-26px_rgba(16,16,20,0.8)] hover:shadow-[0_24px_55px_-30px_rgba(16,16,20,0.8)]"
            >
              <div className="absolute top-0 right-0 p-4 opacity-[0.06] transition-opacity group-hover:opacity-10">
                <program.icon size={80} className="text-ink" />
              </div>

              <div className="bg-brand-soft w-14 h-14 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <program.icon className="text-brand-strong w-7 h-7" />
              </div>

              <h4 className="display-xl text-3xl mb-3">{program.title}</h4>
              <p className="text-ink/60 mb-6 leading-relaxed">
                {program.desc}
              </p>

              <div className="flex flex-wrap gap-2">
                {program.tags.map((tag, tIdx) => (
                  <span
                    key={tIdx}
                    className="px-3 py-1 bg-cream rounded-full text-xs font-medium text-ink/60"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <Link
                to={`/apply?program=${encodeURIComponent(program.title)}`}
                className="mt-8 inline-flex items-center text-brand font-semibold group-hover:translate-x-2 transition-transform"
              >
                Apply for this <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Programs;
