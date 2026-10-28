"use client";

import Link from "next/link";
import { CONFIG } from "@/lib/config";
import { formatPercent } from "@/lib/format";
import {
  ChoicesDemo,
  CreditTable,
  MasteryStill,
  MathPlayground,
  PracticeResultStill,
  QuestionStill,
  QuizFormStill,
  ReferenceLive,
  ReferenceStill,
  ResultsStill,
  RollDemo,
  TreeStill,
  TrendLive,
  TypedTable,
} from "./HelpFigures";

const SECTIONS = [
  { id: "start", label: "Start here" },
  { id: "bank", label: "The Bank" },
  { id: "writing", label: "Writing questions" },
  { id: "maths", label: "Maths and formatting" },
  { id: "computation", label: "Dynamic questions" },
  { id: "choices", label: "Choices and wrong answers" },
  { id: "sources", label: "References and sources" },
  { id: "concepts", label: "Concepts and AI drafts" },
  { id: "quiz", label: "Taking a quiz" },
  { id: "practice", label: "Practice quizzes" },
  { id: "mock", label: "Mock boards" },
  { id: "scoring", label: "Scoring and mastery" },
  { id: "results", label: "Results and analytics" },
  { id: "backup", label: "Backup and sharing" },
  { id: "ai", label: "The AI helper" },
  { id: "keys", label: "Keyboard and tips" },
  { id: "trouble", label: "When something looks wrong" },
] as const;

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-4 space-y-3">
      <h2 id={`${id}-title`} className="border-b border-line pb-1 text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal space-y-1.5 pl-6 text-sm">{children}</ol>;
}

function Points({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-6 text-sm">{children}</ul>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed">{children}</p>;
}

function Btn({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-line bg-surface px-1.5 py-0.5 text-[13px] font-medium">{children}</span>
  );
}

export default function HelpPage() {
  const q = CONFIG.quiz;
  const d = CONFIG.masteryDays;

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <nav aria-label="Contents" className="sticky top-4 rounded-md border border-line bg-surface p-3">
        <p className="mb-2 text-sm font-medium">Contents</p>
        <ul className="space-y-0.5 text-sm">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="block rounded px-2 py-1 text-muted hover:bg-paper hover:text-ink">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="max-w-3xl space-y-10">
        <div>
          <h1 className="text-xl font-semibold">Help</h1>
          <p className="mt-1 text-sm text-muted">
            What you can do here, and how. Pictures marked <span className="font-medium text-accent">Live example</span>{" "}
            are the real parts of the site, so you can try them. The other pictures show a screen, and cannot be
            clicked.
          </p>
        </div>

        <Section id="start" title="Start here">
          <P>
            ECE Review is your own question bank and a place to quiz yourself on it. Everything you write is kept in
            this browser, on this computer. Nothing leaves it unless you turn on the AI helper or share a file yourself.
          </P>
          <Steps>
            <li>
              Open the <Btn>Bank</Btn> from the profile menu at the top right, and add a subject and a topic.
            </li>
            <li>
              Add questions to the topic. Aim for {q.topic.minItems} or more per topic, so a quiz can award mastery.
            </li>
            <li>
              Go to <Btn>Quiz</Btn>, pick the topic, and start. Your <Btn>Home</Btn> page shows what to quiz next.
            </li>
            <li>
              Open <Btn>Settings</Btn> and export a backup now and then. Clearing your browser data erases the bank.
            </li>
          </Steps>
          <P>
            The profile menu at the top right holds <Btn>Analytics</Btn>, <Btn>Bank</Btn>, <Btn>Settings</Btn>, and this{" "}
            <Btn>Help</Btn> page. The site needs a wide window. On a small screen it asks you to use a larger one.
          </P>
        </Section>

        <Section id="bank" title="The Bank">
          <P>
            The Bank is where everything you own lives. Questions and Concepts have a tab each. The tree on the left
            decides where things are filed.
          </P>
          <TreeStill />
          <Points>
            <li>
              Hover a row to see its buttons: <Btn>+</Btn> adds a subject or topic inside it, <Btn>✎</Btn> renames, the
              arrows move it up or down, and <Btn>✕</Btn> deletes it. You are asked before anything is deleted.
            </li>
            <li>
              A subject can sit in more than one category, when two categories cover it. It is marked{" "}
              <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">shared</span>,
              and its questions count in each.
            </li>
            <li>
              Click a topic or subject to see only its questions. The list can be searched, and each question can be
              edited or deleted.
            </li>
            <li>
              The tag row has <Btn>Untagged</Btn>, which shows the questions that have no tag so they are easy to find.
              Under a tag such as <code>solving</code>, the questions that have only that kind of tag come first.
            </li>
          </Points>
        </Section>

        <Section id="writing" title="Writing questions">
          <P>
            Choose <Btn>New question</Btn>. Pick the category, subject, and topic, write the question, write the
            choices, and mark the correct one. Empty choice boxes are left out when you save, so you can use two to
            eight choices.
          </P>
          <Points>
            <li>
              <strong>Tags</strong> are optional labels such as “series circuits”. They group questions inside a topic
              and show up in your analytics. A topic quiz is built from them: most quizzes are spread evenly across the
              tags, and some lean on one tag for up to about {Math.round(CONFIG.build.focusShare.max * 100)}% of the
              questions, so you do not get used to one shape. The tags <code>concept</code> and <code>solving</code> say
              what kind of question it is, so a quiz never builds around them.
            </li>
            <li>
              <strong>Reference</strong> is optional. It says where the question came from. See{" "}
              <a href="#sources" className="underline">
                References and sources
              </a>
              .
            </li>
            <li>
              <strong>Times it can appear in one quiz</strong> is 1 unless you change it, and can go up to{" "}
              {CONFIG.maxRepeats}. Each appearance counts as its own question. Copies are spread apart in the quiz, and
              a dynamic question gets different numbers every time. Mock boards always show a question once.
            </li>
            <li>
              <strong>Allow AI to reword</strong> lets the AI helper write alternative wordings of the question. Nothing
              it writes is shown until it passes a check.
            </li>
            <li>
              <Btn>Save and add another</Btn> keeps the topic, the type, the tags, and the source, so a run of questions
              from one book goes quickly.
            </li>
          </Points>
        </Section>

        <Section id="maths" title="Maths and formatting">
          <P>
            Every text box on the site understands formatting and maths. Click into any box and a toolbar floats above
            it with buttons for bold, italic, lists, tables, links, fractions, powers, roots, integrals, and more. You
            can use the buttons or just type.
          </P>
          <MathPlayground />
          <TypedTable />
          <Points>
            <li>
              <strong>Pictures</strong>: paste, drop, or choose an image in a box and it is saved in your bank. Click a
              picture in a quiz to enlarge it.
            </li>
            <li>
              <strong>Formatting</strong>: <code>**bold**</code>, <code>*italic*</code>, lists that start with{" "}
              <code>-</code> or <code>1.</code>, tables, and a single line break stays a line break.
            </li>
            <li>
              Words inside a formula go in quotes so they are not read as letters, as in{" "}
              <code>V_(&quot;out&quot;)</code>.
            </li>
          </Points>
        </Section>

        <Section id="computation" title="Dynamic questions">
          <P>
            A dynamic question is a recipe. Instead of one fixed question, you describe how to make many, and every quiz
            rolls fresh numbers. The formula stays the same while the numbers change, which is what you want for problem
            solving. Choose <Btn>Dynamic</Btn> as the type of question. A <Btn>Standard</Btn> question never changes:
            you type the question and the choices yourself, and it can still be a calculation problem because you type
            the numbers.
          </P>
          <Steps>
            <li>
              <strong>Question wording</strong>: write the question with <code>{"{R1}"}</code> where a number should go.
              Add several wordings and one is picked at random.
            </li>
            <li>
              <strong>Given values</strong>: for each name, choose how it is rolled, such as a list of values or a range
              with a step. Values can use SI suffixes such as 4.7k, 2.2u, or 10m.
            </li>
            <li>
              <strong>Derived values</strong> (optional): values worked out from the givens, such as{" "}
              <code>XL = 2*pi*f*L</code>.
            </li>
            <li>
              <strong>Constraints</strong> (optional): conditions every roll must meet, such as <code>R1 != R2</code>. A
              roll that fails is thrown away.
            </li>
            <li>
              <strong>Choices</strong>: write each choice as a formula and mark the correct one, or switch to sentences.
            </li>
            <li>
              <strong>How answers are shown</strong>: the unit, the significant figures, and the notation: engineering
              (3.18 kΩ), scientific (3.18 × 10³ Ω), or plain (3180 Ω).
            </li>
          </Steps>
          <RollDemo />
          <P>
            Press <Btn>Roll a preview</Btn> in the editor to test your own recipe. A recipe that cannot make a question,
            or makes two choices that are almost the same number, is reported with the reason, and cannot be saved until
            it works.
          </P>
        </Section>

        <Section id="choices" title="Choices and wrong answers">
          <Points>
            <li>
              <strong>Formulas or sentences.</strong> With formulas, each choice is worked out to a number, so wrong
              choices are the answers that wrong methods give, such as forgetting to invert. With sentences, each choice
              is text, and can use <code>{"{name}"}</code> for a rolled value.
            </li>
            <li>
              <strong>One toolbar for the choices.</strong> Click a choice, then press a button on the shared toolbar.
            </li>
            <li>
              <strong>Suggest wrong choices.</strong> Writing the question and the right answer is easy. Coming up with
              convincing wrong ones is not. Write the question, mark and fill in the correct choice, leave some choices
              empty, and press <Btn>Suggest wrong choices</Btn>. The AI fills the empty boxes with confusing, similar,
              or wrong-method answers, which you can edit. For a dynamic question, it suggests formulas, and every one
              is checked to be a real, different answer before you see it. It needs the AI helper (see below).
            </li>
          </Points>
          <ChoicesDemo />
        </Section>

        <Section id="sources" title="References and sources">
          <P>
            A reference says where a question or a concept came from. It shows in the Bank and when you review a quiz,
            and never during the quiz. Most references come from a few books, so you save each book once and reuse it.
          </P>
          <ReferenceStill />
          <Steps>
            <li>
              In the Reference box, choose <Btn>+ New source…</Btn>. Fill in the kind, the title, and whatever else you
              know: author, edition, year, publisher, or a web address. Press <Btn>Save source</Btn>.
            </li>
            <li>
              On each question, pick the source from the dropdown, then type only the page number, such as{" "}
              <code>143</code> or <code>143-145</code>. The page box takes numbers only.
            </li>
            <li>
              <Btn>Manage sources</Btn> lets you edit or remove a source. Questions that already use it keep their text.
            </li>
            <li>
              <Btn>Type it myself</Btn> is there for anything that is not worth saving. Web addresses in a reference
              become links.
            </li>
          </Steps>
          <ReferenceLive />
        </Section>

        <Section id="concepts" title="Concepts and AI drafts">
          <P>
            A concept is a short note you write about an idea, such as a definition or a derivation, filed under a
            topic. Open the <Btn>Concepts</Btn> tab in the Bank and choose <Btn>New concept</Btn>.
          </P>
          <Points>
            <li>
              With an AI key set up, tick concepts and press <Btn>Draft with AI</Btn>. The AI writes questions from each
              concept, a second model checks them, and they wait for you inside the concept. You accept, edit, or reject
              each one. Nothing is added to your bank until you accept it.
            </li>
            <li>A question you accept inherits the concept&apos;s reference, so you type it once.</li>
            <li>
              Concepts that already have drafts are skipped, so the same ideas are not asked twice, unless you ask to
              redo them.
            </li>
          </Points>
        </Section>

        <Section id="quiz" title="Taking a quiz">
          <P>
            Open <Btn>Quiz</Btn> and choose a topic, a subject, or a category. A topic or a subject opens the form
            below. A category opens a mock board.
          </P>
          <QuizFormStill />
          <Points>
            <li>
              A topic quiz has {q.topic.minItems} to {q.topic.maxItems} questions ({q.topic.defaultItems} to start) and
              always {q.topic.totalMinutes} minutes. A subject or category quiz is at least {q.subject.minItems}{" "}
              questions, and you choose the time. The suggested time is {q.suggestedSecPerItem} seconds a question.
            </li>
            <li>
              The time is a target only. The timer counts up, never stops the quiz, and never changes your score. It is
              shown afterward as a statistic. It stops while the browser tab is hidden.
            </li>
            <li>
              A quiz in progress waits on the Quiz page with <Btn>Resume</Btn>. You can discard it, and then none of it
              is scored.
            </li>
          </Points>
          <QuestionStill />
        </Section>

        <Section id="practice" title="Practice quizzes">
          <P>
            Beside <Btn>Start quiz</Btn> there is a <Btn>Practice</Btn> button, on topic, subject, and mock board forms.
            A practice quiz is the same quiz with the same settings, but it is only for learning.
          </P>
          <QuizFormStill practice />
          <Points>
            <li>It never awards mastery, even if you reach the bar.</li>
            <li>It never starts the {CONFIG.cooldownHours}-hour lock, even if you do badly.</li>
            <li>You can practise while an item is locked, or while it is already mastered.</li>
            <li>It is saved with your other results and counted in your analytics, with a Practice label.</li>
          </Points>
          <PracticeResultStill />
        </Section>

        <Section id="mock" title="Mock boards">
          <P>
            A mock board is a quiz for a whole category, built from a blueprint that says how much of the quiz comes
            from each subject or topic. Open <Btn>Blueprint</Btn> beside a category on the Quiz page.
          </P>
          <Points>
            <li>
              Add the subjects or topics you want, and give each a percent.{" "}
              <Btn>Spread evenly across this category’s subjects</Btn> shares it out. The questions are split to match,
              with whole numbers that add up exactly.
            </li>
            <li>
              A mock has no pause, you cannot go back, and every question must be answered to move on. It ends after the
              last one.
            </li>
            <li>
              A mock shows each question once, whatever its repeat setting. <Btn>Practice</Btn> works here too.
            </li>
          </Points>
        </Section>

        <Section id="scoring" title="Scoring and mastery">
          <P>
            A right answer earns credit, and how sure you said you were decides how much. A wrong answer earns nothing,
            and a right answer you marked “Just guessed” earns nothing either, so guessing never pays.
          </P>
          <CreditTable />
          <Points>
            <li>
              A quiz <strong>passes</strong> at an average credit of {formatPercent(CONFIG.passBar, 0)}, or the mastery
              bar you set in Settings. Nothing else is asked of it, and it does not matter which tags or topics came up.
            </li>
            <li>
              A passing quiz that is long enough earns <strong>mastery</strong>: {d.topic} days for a topic, {d.subject}{" "}
              for a subject, {d.category} for a category. Passing again starts a fresh window.
            </li>
            <li>
              A failed quiz that could have earned mastery <strong>locks</strong> that item for {CONFIG.cooldownHours}{" "}
              hours. Mastery you already hold is not removed. A quiz that is too short to award mastery never locks
              anything.
            </li>
            <li>
              Mastery needs at least {q.topic.minItems} questions for a topic, and {q.subject.minItems} for a subject or
              category.
            </li>
            <li>
              <strong>Recheck</strong> is on every result. It judges that quiz again under the mastery bar and minimum
              now, and dates the mastery to the day the quiz was taken, so the time it lasts does not move. It can give
              mastery and it can take it away. It never locks anything.
            </li>
            <li>
              When the mastery bar or the minimums change, the quizzes whose mastery could still be running are
              rechecked for you, and a message says how many gained or lost mastery. Older quizzes are left alone,
              because they cannot change what is mastered now.
            </li>
          </Points>
          <MasteryStill />
        </Section>

        <Section id="results" title="Results and analytics">
          <ResultsStill />
          <Points>
            <li>
              The results list every question with your answer, the right one, how sure you were, the time taken, and
              the reference. You can show only the ones you got wrong, or lost credit on.
            </li>
            <li>
              <strong>Analytics</strong> (profile menu) has two tabs. <strong>Mastery</strong> shows every category,
              subject, and topic with its status and when it runs out. <strong>Analytics</strong> shows credit over
              time, your weakest topics and tags, how well your sureness matched your answers, and questions worth a
              second look.
            </li>
            <li>
              <strong>Home</strong> shows what is next to quiz, how many topics are left, what expires soon, and your
              latest results.
            </li>
          </Points>
          <TrendLive />
        </Section>

        <Section id="backup" title="Backup and sharing">
          <P>
            Open <Btn>Settings</Btn> and find <strong>Backup and sharing</strong>.
          </P>
          <Points>
            <li>
              <strong>Full backup</strong> saves everything to a file (<code>.ecebak</code>): questions, concepts,
              results, mastery, and your sources. You can protect it with a password. Restore it on this or another
              computer.
            </li>
            <li>
              <strong>Bank pack</strong> (<code>.ecepack</code>) shares only the learning material with someone else. It
              never includes your results, mastery, or settings. Share only material you have the right to share.
            </li>
            <li>
              <strong>Import</strong> shows what a file would add or change before anything happens. Importing a pack
              never touches your quiz history.
            </li>
            <li>
              <strong>Storage</strong> shows how much room is used. The site asks the browser not to delete your data
              when it runs low on space.
            </li>
          </Points>
        </Section>

        <Section id="ai" title="The AI helper">
          <P>
            The AI helper is optional. Without it, everything works exactly as written. With it, you get reworded
            questions, drafts from concepts, and suggested wrong choices.
          </P>
          <Points>
            <li>
              In <Btn>Settings</Btn>, add a key for a provider. The page shows how to get a free key from Groq. You can
              also use an in-browser model that needs no key, for dynamic questions.
            </li>
            <li>
              By default, keys are forgotten when you close the tab. Turn on “Remember my keys on this device” to keep
              them.
            </li>
            <li>
              Everything the AI writes is checked before you see it, and a reworded question is never shown in a quiz
              until it is approved. Numbers and answers are never changed without a check.
            </li>
          </Points>
        </Section>

        <Section id="keys" title="Keyboard and tips">
          <Points>
            <li>
              <strong>In a quiz</strong>: <Btn>A</Btn> to <Btn>H</Btn> pick a choice, <Btn>S</Btn> Sure, <Btn>W</Btn>{" "}
              Wise guess, <Btn>N</Btn> Not sure, <Btn>J</Btn> Just guessed, <Btn>Enter</Btn> confirm.
            </li>
            <li>
              <strong>In a text box</strong>: Ctrl+B bold, Ctrl+I italic. Press Enter in a list to continue it, and Tab
              to indent.
            </li>
            <li>The small ⓘ marks next to headings explain the details of that part of the page.</li>
            <li>The sun and moon button at the top switches between light and dark.</li>
          </Points>
        </Section>

        <Section id="trouble" title="When something looks wrong">
          <Points>
            <li>
              <strong>Start quiz is greyed out.</strong> The item is locked after a failed quiz, or the number of
              questions is not valid. <Btn>Practice</Btn> still works while it is locked.
            </li>
            <li>
              <strong>“Practice only” on the form.</strong> The quiz is too short, or there are too few questions, to
              award mastery. Add questions, or ask for more.
            </li>
            <li>
              <strong>A dynamic recipe will not save.</strong> Read the list above <Btn>Roll a preview</Btn>. It names
              the exact box that has a problem.
            </li>
            <li>
              <strong>Maths shows as plain text.</strong> Check that the formula sits between dollar signs.
            </li>
            <li>
              <strong>My questions are gone.</strong> They live in this browser. A different browser, a private window,
              or cleared site data starts empty. Restore your latest backup from{" "}
              <Link href="/settings#backup" className="underline">
                Settings
              </Link>
              .
            </li>
          </Points>
        </Section>
      </div>
    </div>
  );
}