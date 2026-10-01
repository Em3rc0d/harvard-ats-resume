import { FirstRunExperience } from "../components/first-run/FirstRunExperience";
import { AIAccessSessionProvider } from "../components/providers/AIAccessSessionProvider";
import { getSupabasePublicConfig } from "../infrastructure/supabase/config";

export default function Home() {
  const authConfigured = getSupabasePublicConfig() !== null;
  return (
    <AIAccessSessionProvider>
      <FirstRunExperience authConfigured={authConfigured} />
    </AIAccessSessionProvider>
  );
}
