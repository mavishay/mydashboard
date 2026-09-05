import { TaskList } from "./TaskList";
import { EmailList } from "./EmailList";
import { TodayCalendar } from "./TodayCalendar";
import Footer from "./Footer";

interface ServiceInfo {
  id: string;
  name: string;
  status: string;
  lastError: string | null;
  startedAt: string | null;
}

export function Dashboard() {
  return (
    <div className="h-screen flex flex-col">
      <header className="flex justify-between items-center p-4">
        <h1 className="text-2xl font-bold">Focus Board</h1>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-6 flex-1 p-4">
        <div className="space-y-4">
          <EmailList />
        </div>
        <div className="space-y-4">
          <TodayCalendar />
          <TaskList />
        </div>
      </div>
      <Footer />
    </div>
  );
}
