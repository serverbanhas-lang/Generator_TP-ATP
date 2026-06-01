export type Phase = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export enum ATPMethod {
  KonkretAbstrak = 'Konkret → Abstrak',
  Deduktif = 'Deduktif',
  MudahSulit = 'Mudah → Sulit',
  Hierarkis = 'Hierarkis',
  Prosedural = 'Prosedural',
  Scaffolding = 'Scaffolding',
}

export interface AssessmentSchedule {
  month: string;
  week: number;
}

export interface FormData {
  schoolName: string;
  subject: string;
  phase: Phase;
  cp: string;
  atpMethod: ATPMethod;
  // Map of class label (e.g., "1") to JP per year
  classJpMap: Record<string, number>;
  // Map of class label (e.g., "1") to JP per meeting
  jpPerMeeting: Record<string, number>;
  sts1: AssessmentSchedule;
  sts2: AssessmentSchedule;
  sas: AssessmentSchedule;
  sat: AssessmentSchedule;
}

// Data structures for the Generated Output (from AI)
export interface GeneratedData {
  tujuanPembelajaran: LearningObjective[];
  atp: ATPRow[];
  prosem: ProsemRow[];
  prota: ProtaRow[];
  mingguEfektif: MingguEfektifRow[];
}

export interface MingguEfektifRow {
  no: number;
  semester: number;
  bulan: string;
  jumlahMinggu: number;
  mingguEfektif: number;
  mingguTidakEfektif: number;
  keterangan: string;
}

export interface LearningObjective {
  no: number;
  elemen: string;
  capaianPembelajaran: string;
  materi: string;
  kompetensi: string;
  tujuanPembelajaran: string;
}

export interface ATPRow {
  no: number;
  semester: number;
  kelas: string;
  materi: string;
  capaianKompetensi: string;
  kompetensi: string;
  elemen: string;
  tujuanPembelajaran: string;
  alokasiWaktu: number;
  asesmenFormatif: string;
  asesmenSumatif: string;
  profilLulusan: string[];
  topikPancaCinta: string[];
}

export interface ProtaRow {
  no: number;
  semester: number;
  kelas: string;
  materi: string;
  tujuanPembelajaran: string;
  alokasiWaktu: number;
}

export interface ProsemRow {
  no: number;
  semester: number;
  kelas: string;
  materi: string;
  tujuanPembelajaran: string;
  alokasiWaktu: number;
  // Simplified schedule: array of objects indicating which month/week carries the load
  // or a simple structure to rendering the checkboxes
  scheduleAllocation: Array<{
    month: string;
    weeks: number[]; // 1-5
  }>;
  isAssessment?: boolean; // To highlight STS/SAS/SAT rows
  assessmentType?: string; // 'STS1', 'STS2', 'SAS', 'SAT', 'Cadangan'
}