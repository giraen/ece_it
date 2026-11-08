"use client";

import SettingsSubpage from "@/components/settings/SettingsSubpage";
import TagManager from "@/components/settings/TagManager";

export default function Page() {
  return (
    <SettingsSubpage
      title="Tags"
      tip="Every tag in your bank. Rename one to change it on all questions and notes, rename it to an existing tag to merge the two, or delete it to take it off everything. You can undo right after."
    >
      <TagManager />
    </SettingsSubpage>
  );
}