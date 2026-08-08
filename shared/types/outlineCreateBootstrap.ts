export type OutlineCreateBootstrapCharacterDraft = {
  name: string;
  role: string;
  personality: string;
  background: string;
  appearance?: string | null;
  development?: string | null;
  selected?: boolean;
};

export type OutlineCreateBootstrapWorldDraft = {
  title: string;
  coverSummary: string;
  sourceText: string;
};

export type OutlineCreateBootstrapDraft = {
  title: string;
  description: string;
  targetAudience: string;
  commercialTags: string[];
  bookSellingPoint: string;
  competingFeel: string;
  first30ChapterPromise: string;
  characters: OutlineCreateBootstrapCharacterDraft[];
  worldDraft: OutlineCreateBootstrapWorldDraft | null;
};
