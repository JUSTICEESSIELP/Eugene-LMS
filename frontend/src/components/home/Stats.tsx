import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Microscope, Code, Award, Globe } from "lucide-react";

const data = [
  { year: "2019", graduates: 1200, research: 85 },
  { year: "2020", graduates: 1500, research: 92 },
  { year: "2021", graduates: 1800, research: 105 },
  { year: "2022", graduates: 2400, research: 140 },
  { year: "2023", graduates: 3100, research: 185 },
  { year: "2024", graduates: 3800, research: 240 },
];

const Stats = () => {
  return (
    <section id="stats" className="py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16 space-y-4">
          <h2 className="text-brand font-semibold tracking-widest uppercase text-sm">
            Our impact
          </h2>
          <h3 className="display-xl text-5xl md:text-6xl">
            Proven excellence in education
          </h3>
          <p className="text-ink/60 max-w-2xl mx-auto">
            We don't just teach; we empower. Our metrics show a consistent
            upward trajectory in student success and research output.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Chart Section */}
          <div className="lg:col-span-2 bg-white p-8 rounded-[2rem] shadow-[0_18px_45px_-30px_rgba(16,16,20,0.6)]">
            <h4 className="text-xl font-semibold mb-6">
              Enrollment & Research Growth
            </h4>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id="colorGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#5769E7" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#5769E7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#e8e2db"
                  />
                  <XAxis dataKey="year" stroke="#666" fontSize={12} />
                  <YAxis stroke="#666" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--tw-bg-opacity, white)",
                      border: "1px solid #ddd",
                      borderRadius: "8px",
                    }}
                    itemStyle={{ color: "#5769E7" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="graduates"
                    stroke="#5769E7"
                    fillOpacity={1}
                    fill="url(#colorGrad)"
                    strokeWidth={3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Feature Grid */}
          <div className="grid grid-cols-1 gap-6">
            {[
              {
                icon: Microscope,
                title: "250+ Research Labs",
                desc: "World-class facilities for breakthrough innovation.",
                color: "text-blue-500",
              },
              {
                icon: Code,
                title: "15 Tech Hubs",
                desc: "Dedicated spaces for startups and coding marathons.",
                color: "text-purple-500",
              },
              {
                icon: Globe,
                title: "50+ Global Partners",
                desc: "Study exchange programs with Ivy League universities.",
                color: "text-brand",
              },
              {
                icon: Award,
                title: "Tier 1 Ranking",
                desc: "Recognized globally for educational excellence.",
                color: "text-yellow-500",
              },
            ].map((item, idx) => (
              <div
                key={idx}
                className="bg-white p-6 rounded-[1.5rem] flex items-start space-x-4 transition-shadow cursor-default shadow-[0_10px_30px_-24px_rgba(16,16,20,0.7)] hover:shadow-[0_18px_45px_-28px_rgba(16,16,20,0.7)]"
              >
                <div className={`p-3 rounded-xl bg-cream ${item.color}`}>
                  <item.icon className="w-6 h-6" />
                </div>
                <div>
                  <h5 className="font-semibold">{item.title}</h5>
                  <p className="text-sm text-ink/60">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Stats;
