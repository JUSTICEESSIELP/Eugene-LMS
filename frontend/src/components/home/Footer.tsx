import { Github, Twitter, Linkedin, ArrowUp } from "lucide-react";
import Logo from "@/components/global/Logo";

const Footer = () => {
  return (
    <footer className="bg-ink text-cream pt-20 pb-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
          <div className="space-y-6">
            <Logo />
            <p className="text-cream/60 leading-relaxed">
              Redefining higher education through technology, innovation, and
              global connectivity. Join the frontier.
            </p>
            <div className="flex space-x-4">
              <a
                href="#"
                className="w-10 h-10 rounded-full bg-cream/10 flex items-center justify-center hover:bg-brand hover:text-white transition-colors text-cream/70"
              >
                <Twitter className="w-5 h-5" />
              </a>
              <a
                href="#"
                className="w-10 h-10 rounded-full bg-cream/10 flex items-center justify-center hover:bg-brand hover:text-white transition-colors text-cream/70"
              >
                <Linkedin className="w-5 h-5" />
              </a>
              <a
                href="#"
                className="w-10 h-10 rounded-full bg-cream/10 flex items-center justify-center hover:bg-brand hover:text-white transition-colors text-cream/70"
              >
                <Github className="w-5 h-5" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="display-xl text-xl mb-6">
              Academics
            </h4>
            <ul className="space-y-4">
              <li>
                <a
                  href="#"
                  className="text-cream/60 hover:text-cream transition-colors"
                >
                  Undergraduate
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-cream/60 hover:text-cream transition-colors"
                >
                  Postgraduate
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-cream/60 hover:text-cream transition-colors"
                >
                  Executive Education
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-cream/60 hover:text-cream transition-colors"
                >
                  Online Courses
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-cream/60 hover:text-cream transition-colors"
                >
                  Scholarships
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="display-xl text-xl mb-6">
              Resources
            </h4>
            <ul className="space-y-4">
              <li>
                <a
                  href="#"
                  className="text-cream/60 hover:text-cream transition-colors"
                >
                  Campus Map
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-cream/60 hover:text-cream transition-colors"
                >
                  Library
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-cream/60 hover:text-cream transition-colors"
                >
                  Research Portal
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-cream/60 hover:text-cream transition-colors"
                >
                  Career Center
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-cream/60 hover:text-cream transition-colors"
                >
                  Alumni Network
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="display-xl text-xl mb-6">
              Newsletter
            </h4>
            <p className="text-cream/60 mb-6">
              Stay updated with the latest research breakthroughs and campus
              news.
            </p>
            <div className="flex">
              <input
                type="email"
                placeholder="Email address"
                className="bg-cream/10 rounded-l-full px-5 py-3 text-cream placeholder:text-cream/40 focus:outline-none w-full"
              />
              <button className="bg-brand text-white px-6 py-3 rounded-r-full font-semibold hover:bg-brand-strong transition-colors">
                Join
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-cream/15 pt-8 flex flex-col md:flex-row items-center justify-between text-sm text-cream/50">
          <p>© 2026 Veya University. All rights reserved.</p>
          <div className="flex space-x-6 mt-4 md:mt-0">
            <a
              href="#"
              className="hover:text-cream transition-colors"
            >
              Privacy Policy
            </a>
            <a
              href="#"
              className="hover:text-cream transition-colors"
            >
              Terms of Service
            </a>
            <a
              href="#"
              className="hover:text-cream transition-colors"
            >
              Cookie Settings
            </a>
          </div>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="mt-6 md:mt-0 p-3 rounded-full bg-cream/10 hover:bg-brand transition-colors group"
          >
            <ArrowUp className="w-5 h-5 text-cream" />
          </button>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
