"use client";

import SettingsSubpage from "@/components/SettingsSubpage";
import SourcesManager from "@/components/SourcesManager";

export default function Page() {
  return (
    <SettingsSubpage
      title="Sources"
      tip="The past quizzes, books, websites and videos your questions come from. Make one here, then pick it from the list when you add questions. Changing a name here changes it on every question that uses it."
    >
      <SourcesManager />
    </SettingsSubpage>
  );
}