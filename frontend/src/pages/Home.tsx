import { Link } from "react-router";
import Navbar from "@/components/home/Navbar";
import Hero from "@/components/home/Hero";
import Stats from "@/components/home/Stats";
import Programs from "@/components/home/Programs";
import Footer from "@/components/home/Footer";

const Home = () => {
  return (
    <div className="surface-light bg-cream text-ink">
      <Navbar />
      <main className="">
        <Hero />

        {/* Partnership / Logo Cloud */}
        <section className="py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-center text-ink/50 text-sm font-semibold uppercase tracking-widest mb-8">
              Strategic industry partners
            </p>
            <div className="flex flex-wrap justify-center items-center gap-12">
              {[
                "TECHCORE",
                "NEXUSLABS",
                "SYSTEX",
                "QUANTUM_A",
                "DATAFLOW",
              ].map((partner) => (
                <span
                  key={partner}
                  className="display-xl text-2xl text-ink/35 hover:text-ink transition-colors"
                >
                  {partner}
                </span>
              ))}
            </div>
          </div>
        </section>

        <Stats />
        <Programs />

        {/* Testimonial Highlight */}
        <section className="py-24 bg-brand text-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h3 className="display-xl text-4xl md:text-6xl mb-12">
              “The multidisciplinary approach at Veya prepared me for a career
              that didn't exist when I started my degree.”
            </h3>
            <div className="flex flex-col items-center">
              <img
                src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=facearea&facepad=3&w=200&h=200&q=80"
                alt="Student"
                className="w-20 h-20 rounded-full mb-4 object-cover"
              />
              <p className="text-xl font-semibold">Sarah Chen</p>
              <p className="opacity-75">
                Lead AI Researcher at TechCore • Class of '22
              </p>
            </div>
          </div>
        </section>

        {/* Call to Action */}
        <section className="py-24 relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-ink text-cream rounded-[3rem] p-12 md:p-20 text-center">
              <h2 className="display-xl text-5xl md:text-7xl mb-6">
                Ready to shape the future?
              </h2>
              <p className="text-xl text-cream/70 mb-10 max-w-2xl mx-auto">
                Applications for the Fall 2026 semester are closing soon. Take
                the first step towards a boundary-breaking career today.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Link
                  to="/apply"
                  className="bg-brand text-white px-10 py-5 rounded-full font-semibold text-lg hover:bg-brand-strong transition-colors"
                >
                  Apply Now
                </Link>
                <a
                  href="mailto:admissions@eugene-lms.com?subject=Admissions%20enquiry"
                  className="border border-cream/30 text-cream px-10 py-5 rounded-full font-semibold text-lg hover:bg-cream hover:text-ink transition-colors"
                >
                  Contact Admissions
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Home;
