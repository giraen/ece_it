"use client";

import SettingsSubpage from "@/components/settings/SettingsSubpage";
import TagManager from "@/components/settings/TagManager";

export default function Page() {
  return (
    <SettingsSubpage
      title="Tags"
      tip="Every tag in your bank. Questions, notes and memory cards share one set of tags. Rename one to change it on all of them, rename it to an existing tag to merge the two, or delete it to take it off everything. You can undo right after."
    >
      <TagManager />
    </SettingsSubpage>
  );
}
