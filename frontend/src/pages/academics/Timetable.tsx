import { useState, useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/AuthProvider";
import type { schedule } from "@/types";
import GeneratorControls, {
  type GenSettings,
} from "@/components/timetable/GeneratorControls";
import TimetableGrid from "@/components/timetable/TimetableGrid";

const Timetable = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isStudent = user?.role === "student";

  const [scheduleData, setScheduleData] = useState<schedule[]>([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedClass, setSelectedClass] = useState("");

  // fetch timetable
  const fetchTimetable = async (classId: string) => {
    if (!classId) return;

    // `setLoadingSchedule` was only ever called with `false`, so the grid's
    // "Loading schedule..." state was unreachable and the user saw "No
    // Timetable Generated" — a wrong answer — while the request was in flight.
    setLoadingSchedule(true);
    try {
      const { data } = await api.get(`/timetables/${classId}`);
      setScheduleData(data.schedule || []);
      return true;
    } catch (error: any) {
      const status = error.response?.status;
      const payload = error.response?.data;
      if (status === 404) {
        setScheduleData([]);
        // The API answers 404 for three different things: no timetable, one
        // still generating, and one that failed. Only the first is "nothing to
        // see"; the other two were being reported as success.
        if (payload?.status === "failed") {
          toast.error(payload.message || "Timetable generation failed");
          return true;
        }
        if (payload?.status === "pending") return false;
        if (!isAdmin) {
          toast("No schedule found for this class", { icon: "📅" });
        }
        return true;
      }
      toast.error("Failed to load timetable");
      return true;
    } finally {
      setLoadingSchedule(false);
    }
  };

  // auto fetch using useEffect
  useEffect(() => {
    if (selectedClass) {
      fetchTimetable(selectedClass);
    }
  }, [selectedClass]);

  const handleGenerate = async (
    selectedClass: string,
    yearId: string,
    settings: GenSettings
  ) => {
    try {
      setIsGenerating(true);
      // sorry about that, we should be passing classId instead of selectedClass, now that won't work coz class is not assigned teachers and subjects
      const { data } = await api.post("/timetables/generate", {
        classId: selectedClass,
        academicYearId: yearId,
        settings,
      });

      toast.success(data.message || "AI Generation Started");
      setScheduleData([]);

      // Generation runs after the response, so poll until the row leaves
      // `pending`. The old version fired once after 5s and announced
      // "Schedule refreshed!" unconditionally — including when the job had
      // failed and the grid still read "No Timetable Generated".
      let attempts = 0;
      const poll = async () => {
        attempts += 1;
        const settled = await fetchTimetable(selectedClass);
        if (settled || attempts >= 12) {
          setIsGenerating(false);
          if (!settled) {
            toast.error(
              "The timetable is still generating. Reselect the class in a moment to check.",
            );
          }
          return;
        }
        setTimeout(poll, 5000);
      };
      setTimeout(poll, 5000);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Generation failed");
      setIsGenerating(false);
    }
  };
  //   console.log("class timetable:", scheduleData);
  //   console.log("selected class:", selectedClass);
  return (
    <div className="p-4 space-y-6">
      <div>
        <h1 className="display-page text-3xl">
          Timetable Management
        </h1>
        <p className="text-muted-foreground">
          {isStudent
            ? "View your weekly class schedule."
            : "View or manage weekly schedules."}
        </p>
      </div>
      {!isStudent && (
        <GeneratorControls
          onGenerate={handleGenerate}
          onClassChange={fetchTimetable}
          isGenerating={isGenerating}
          selectedClass={selectedClass}
          setSelectedClass={setSelectedClass}
        />
      )}
      <TimetableGrid schedule={scheduleData} isLoading={loadingSchedule} />
    </div>
  );
};

export default Timetable;
