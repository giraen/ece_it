"use client";

import SettingsSubpage from "@/components/settings/SettingsSubpage";
import Duplicates from "@/components/settings/Duplicates";

export default function Page() {
  return (
    <SettingsSubpage
      wide
      title="Possible duplicates"
      tip="Questions and memory cards that look like the same item added twice, each compared with the others in its category. The percentage is how alike the wording is: the words the two share, and the pairs of words in the same order. Keep one and delete the other, or mark the pair as different so it stops showing here."
    >
      <Duplicates />
    </SettingsSubpage>
  );
}
