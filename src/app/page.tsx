import { FirstRunExperience } from "../components/first-run/FirstRunExperience";
import { AIAccessSessionProvider } from "../components/providers/AIAccessSessionProvider";
import { getSupabasePublicConfig } from "../infrastructure/supabase/config";

export default function Home() {
  const authConfigured = getSupabasePublicConfig() !== null;
  const platformGeminiAvailable = Boolean(process.env.GEMINI_API_KEY?.trim());

  return (
    <AIAccessSessionProvider>
      <FirstRunExperience
        authConfigured={authConfigured}
        platformGeminiAvailable={platformGeminiAvailable}
      />
    </AIAccessSessionProvider>
  );
}
