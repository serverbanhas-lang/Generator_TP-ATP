
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";
import { Phase, ATPMethod, FormData, AssessmentSchedule, GeneratedData, ATPRow, ProsemRow, LearningObjective, MingguEfektifRow } from './types';
import { Loader2, FileDown, BookOpen, Calendar, Settings, ChevronRight, CheckCircle2, Globe, GraduationCap, Save, RotateCcw } from 'lucide-react';

const MONTHS = [
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni'
];

const PHASES: Record<Phase, string[]> = {
  A: ['1', '2'],
  B: ['3', '4'],
  C: ['5', '6'],
  D: ['7', '8', '9'],
  E: ['10'],
  F: ['11', '12'],
};

const STORAGE_KEY_RESULT = 'teachflow_last_result';
const STORAGE_KEY_FORM = 'teachflow_last_form';

const DEFAULT_FORM: FormData = {
  schoolName: '',
  subject: '',
  phase: 'A',
  cp: '',
  atpMethod: ATPMethod.KonkretAbstrak,
  classJpMap: { '1': 144, '2': 144 },
  jpPerMeeting: { '1': 4, '2': 4 },
  sts1: { month: 'September', week: 2 },
  sts2: { month: 'Maret', week: 2 },
  sas: { month: 'Desember', week: 2 },
  sat: { month: 'Juni', week: 2 },
};

function App() {
  const [formData, setFormData] = useState<FormData>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_FORM);
    return saved ? JSON.parse(saved) : DEFAULT_FORM;
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GeneratedData | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_RESULT);
    return saved ? JSON.parse(saved) : null;
  });
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'TP' | 'ATP' | 'PROSEM' | 'PROTA' | 'EFEKTIF'>('TP');
  const [isSaved, setIsSaved] = useState(false);

  // Backward compatibility check to generate mingguEfektif if it is missing from old saves
  useEffect(() => {
    if (result && !result.mingguEfektif) {
      const fallbackMingguEfektif: MingguEfektifRow[] = MONTHS.map((bulan, idx) => {
        const semester = idx < 6 ? 1 : 2;
        const jumlahMinggu = 4;
        let mingguTidakEfektif = 1;
        if (['September', 'Maret', 'Desember', 'Juni'].includes(bulan)) {
          mingguTidakEfektif = 2;
        }
        return {
          no: idx + 1,
          semester,
          bulan,
          jumlahMinggu,
          mingguEfektif: jumlahMinggu - mingguTidakEfektif,
          mingguTidakEfektif,
          keterangan: ['Desember', 'Juni'].includes(bulan) ? 'Libur Semester / Asesmen Akhir' : 'KBM Efektif / Pembiasaan'
        };
      });
      setResult(prev => {
        if (!prev) return null;
        return {
          ...prev,
          mingguEfektif: fallbackMingguEfektif
        };
      });
    }
  }, [result]);

  // Sync form to storage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_FORM, JSON.stringify(formData));
  }, [formData]);

  // Check if result matches storage
  useEffect(() => {
    if (!result) {
      setIsSaved(false);
      return;
    }
    const saved = localStorage.getItem(STORAGE_KEY_RESULT);
    if (saved && JSON.stringify(result) === saved) {
      setIsSaved(true);
    } else {
      setIsSaved(false);
    }
  }, [result]);

  const saveToBrowser = () => {
    if (result) {
      localStorage.setItem(STORAGE_KEY_RESULT, JSON.stringify(result));
      setIsSaved(true);
    }
  };

  // Update classJPMap and jpPerMeeting when phase changes
  useEffect(() => {
    const classes = PHASES[formData.phase];
    const newJpMap: Record<string, number> = { ...formData.classJpMap };
    const newMeetingMap: Record<string, number> = { ...formData.jpPerMeeting };
    
    let changed = false;
    classes.forEach(c => {
      if (!newJpMap[c]) {
        newJpMap[c] = 144;
        changed = true;
      }
      if (!newMeetingMap[c]) {
        newMeetingMap[c] = 4;
        changed = true;
      }
    });
    
    if (changed) {
      setFormData(prev => ({ 
        ...prev, 
        classJpMap: newJpMap,
        jpPerMeeting: newMeetingMap
      }));
    }
  }, [formData.phase]);

  const handleInputChange = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleJpChange = (cls: string, val: number) => {
    setFormData(prev => ({
      ...prev,
      classJpMap: { ...prev.classJpMap, [cls]: val }
    }));
  };

  const handleJpPerMeetingChange = (cls: string, val: number) => {
    setFormData(prev => ({
      ...prev,
      jpPerMeeting: { ...prev.jpPerMeeting, [cls]: val }
    }));
  };

  const handleAssessmentChange = (type: 'sts1' | 'sts2' | 'sas' | 'sat', field: keyof AssessmentSchedule, val: any) => {
    setFormData(prev => ({
      ...prev,
      [type]: { ...prev[type], [field]: val }
    }));
  };

  const generateCurriculum = async () => {
    if (!formData.cp || !formData.schoolName || !formData.subject) {
      setError("Mohon lengkapi Nama Sekolah, Mata Pelajaran, dan CP.");
      return;
    }
    
    setLoading(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const classes = PHASES[formData.phase];
      
      const prompt = `
        BERTINDAK SEBAGAI: AI Pengembang Kurikulum Kurikulum Merdeka (SD/MI/MTs/MA) Afiliasi Coba.
        
        TUGAS:
        Buat dokumen kurikulum lengkap (TP, ATP, Program Semester, Program Tahunan, serta Rincian Pekan Efektif/RPE) berdasarkan data berikut:
        
        DATA INPUT:
        - Sekolah: ${formData.schoolName}
        - Mapel: ${formData.subject}
        - Fase: ${formData.phase} (Kelas ${classes.join(', ')})
        - CP: ${formData.cp}
        - Metode ATP: ${formData.atpMethod}
        - Alokasi Waktu:
          ${classes.map(c => `Kelas ${c}: Total ${formData.classJpMap[c]} JP/Tahun, JP per Pertemuan: ${formData.jpPerMeeting[c]} JP`).join('\n          ')}
        - Jadwal Asesmen:
          STS 1: ${formData.sts1.month} Minggu ${formData.sts1.week}
          STS 2: ${formData.sts2.month} Minggu ${formData.sts2.week}
          SAS: ${formData.sas.month} Minggu ${formData.sas.week}
          SAT: ${formData.sat.month} Minggu ${formData.sat.week}

        INSTRUKSI KHUSUS & KETENTUAN KAKU (WAJIB PATUH):
        1. "murid" bukan "peserta didik".
        2. KONSISTENSI KETAT: TP di 'tujuanPembelajaran', 'atp', 'prota', dan 'prosem' harus identik.
        3. SATU TP SATU KKO.
        4. KELIPATAN JP: Alokasi JP per TP wajib kelipatan dari 'JP per Pertemuan'.
        5. AKURASI TOTAL JP: Total JP/Tahun per kelas HARUS SAMA PERSIS dengan input.
        6. PROFIL LULUSAN (2-3 dimensi).
        7. PANCA CINTA (2-3 dimensi).
        8. RINCIAN PEKAN EFEKTIF (RPE): Buat analisis minggu efektif untuk 12 bulan (Juli s.d Juni) dalam array 'mingguEfektif'. Isikan jumlah minggu total, minggu efektif, minggu tidak efektif, dan keterangan kegiatan yang rasional sesuai jadwal asesmen dan kalender akademik (misalkan Juli ada MPLS, Desember & Juni ada asesmen akhir/libur semester, dll).

        OUTPUT FORMAT (JSON ONLY):
        {
          "tujuanPembelajaran": [
            { "no": 1, "elemen": "...", "capaianPembelajaran": "...", "materi": "...", "kompetensi": "...", "tujuanPembelajaran": "..." }
          ],
          "atp": [
             { "no": 1, "semester": 1, "kelas": "...", "materi": "...", "capaianKompetensi": "...", "kompetensi": "...", "elemen": "...", "tujuanPembelajaran": "...", "alokasiWaktu": 4, "asesmenFormatif": "...", "asesmenSumatif": "...", "profilLulusan": ["..."], "topikPancaCinta": ["..."] }
          ],
          "prosem": [
            { "no": 1, "semester": 1, "kelas": "...", "materi": "...", "tujuanPembelajaran": "...", "alokasiWaktu": 4, "scheduleAllocation": [{ "month": "Juli", "weeks": [3] }], "isAssessment": false, "assessmentType": null }
          ],
          "prota": [
            { "no": 1, "semester": 1, "kelas": "...", "materi": "...", "tujuanPembelajaran": "...", "alokasiWaktu": 4 }
          ],
          "mingguEfektif": [
            { "no": 1, "semester": 1, "bulan": "Juli", "jumlahMinggu": 4, "mingguEfektif": 3, "mingguTidakEfektif": 1, "keterangan": "Libur Kenaikan Kelas, Kegiatan MPLS" }
          ]
        }
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json'
        }
      });

      const text = response.text;
      if (!text) throw new Error("No response from AI");
      
      const json = JSON.parse(text) as GeneratedData;
      setResult(json);
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Terjadi kesalahan saat membuat kurikulum.");
    } finally {
      setLoading(false);
    }
  };

  // Helper to update result sub-arrays
  const updateResult = (key: keyof GeneratedData, index: number, field: string, value: any) => {
    if (!result) return;
    const newData = { ...result };
    (newData[key] as any)[index][field] = value;
    setResult(newData);
  };

  const toggleProsemWeek = (rowIndex: number, month: string, week: number) => {
    if (!result) return;
    const newData = { ...result };
    const row = newData.prosem[rowIndex];
    if (!row.scheduleAllocation) row.scheduleAllocation = [];
    
    let monthAlloc = row.scheduleAllocation.find(s => s.month === month);
    if (!monthAlloc) {
      monthAlloc = { month, weeks: [] };
      row.scheduleAllocation.push(monthAlloc);
    }

    if (monthAlloc.weeks.includes(week)) {
      monthAlloc.weeks = monthAlloc.weeks.filter(w => w !== week);
    } else {
      monthAlloc.weeks = [...monthAlloc.weeks, week].sort();
    }
    
    setResult(newData);
  };

  const exportToWord = () => {
    if (!result) return;

    const headerContent = `
      <div style="font-family: Arial, sans-serif; text-align: center; margin-bottom: 20px;">
        <h2 style="color: #059669;">SEKOLAH DAN MADRASAH</h2>
        <h3>MODUL AJAR & PERANGKAT PEMBELAJARAN</h3>
        <h4>${formData.schoolName.toUpperCase()}</h4>
        <p>Mata Pelajaran: ${formData.subject} | Fase: ${formData.phase}</p>
      </div>
    `;

    const style = `
      <style>
        table { border-collapse: collapse; width: 100%; margin-bottom: 20px; font-family: Arial, sans-serif; font-size: 10pt; }
        th, td { border: 1px solid black; padding: 4px; vertical-align: top; }
        th { background-color: #f0fdf4; font-weight: bold; text-align: center; color: #065f46; }
        .page-break { page-break-before: always; }
      </style>
    `;

    let tpTable = `
      <h3>1. TUJUAN PEMBELAJARAN</h3>
      <table>
        <thead>
          <tr>
            <th>No</th><th>Elemen</th><th>Capaian Pembelajaran</th><th>Materi</th><th>Kompetensi</th><th>Tujuan Pembelajaran</th>
          </tr>
        </thead>
        <tbody>
          ${result.tujuanPembelajaran.map(row => `
            <tr>
              <td>${row.no}</td><td>${row.elemen}</td><td>${row.capaianPembelajaran}</td><td>${row.materi}</td><td>${row.kompetensi}</td><td>${row.tujuanPembelajaran}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    const classes = Array.from(new Set(result.atp.map(r => r.kelas))).sort();
    let atpTables = `<div class="page-break"></div><h3>2. ALUR TUJUAN PEMBELAJARAN (ATP)</h3>`;
    classes.forEach(cls => {
      const rows = result.atp.filter(r => r.kelas == cls);
      atpTables += `
        <h4>KELAS ${cls}</h4>
        <table>
          <thead>
            <tr>
              <th>No</th><th>Smt</th><th>Materi</th><th>Komp.</th><th>Elemen</th><th>Tujuan Pembelajaran</th><th>JP</th><th>Asesmen</th><th>Profil Lulusan</th><th>Panca Cinta</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                <td>${row.no}</td><td>${row.semester}</td><td>${row.materi}</td><td>${row.kompetensi}</td><td>${row.elemen}</td><td>${row.tujuanPembelajaran}</td><td>${row.alokasiWaktu}</td>
                <td>F: ${row.asesmenFormatif}<br>S: ${row.asesmenSumatif}</td><td>${row.profilLulusan.join(', ')}</td><td>${row.topikPancaCinta.join(', ')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    });

    let protaTables = `<div class="page-break"></div><h3>3. PROGRAM TAHUNAN (PROTA)</h3>`;
    classes.forEach(cls => {
        const rows = result.prota.filter(r => r.kelas == cls);
        if (rows.length === 0) return;
        protaTables += `
            <h4>KELAS ${cls}</h4>
            <table>
                <thead>
                    <tr>
                        <th>No</th><th>Semester</th><th>Materi / Tujuan Pembelajaran</th><th>Alokasi Waktu (JP)</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map((row, idx) => `
                        <tr>
                            <td style="text-align:center;">${idx+1}</td>
                            <td style="text-align:center;">${row.semester}</td>
                            <td><strong>${row.materi}</strong><br/>${row.tujuanPembelajaran}</td>
                            <td style="text-align:center;">${row.alokasiWaktu}</td>
                        </tr>
                    `).join('')}
                    <tr style="background-color: #f0fdf4; font-weight: bold;">
                        <td colspan="3" style="text-align:right;">TOTAL JP / TAHUN</td>
                        <td style="text-align:center;">${rows.reduce((sum, r) => sum + (Number(r.alokasiWaktu) || 0), 0)}</td>
                    </tr>
                </tbody>
            </table>
        `;
    });

    let prosemTables = `<div class="page-break"></div><h3>4. PROGRAM SEMESTER (PROSEM)</h3>`;
    classes.forEach(cls => {
        [1, 2].forEach(sem => {
            const rows = result.prosem.filter(r => r.kelas == cls && r.semester == sem);
            if (rows.length === 0) return;
            const relevantMonths = sem === 1 ? MONTHS.slice(0, 6) : MONTHS.slice(6, 12);
            prosemTables += `
                <h4>KELAS ${cls} - SEMESTER ${sem}</h4>
                <table>
                    <thead>
                        <tr>
                            <th rowspan="2">No</th><th rowspan="2">Materi / TP</th><th rowspan="2">JP</th>
                            ${relevantMonths.map(m => `<th colspan="5">${m}</th>`).join('')}
                        </tr>
                        <tr>${relevantMonths.map(() => `<th>1</th><th>2</th><th>3</th><th>4</th><th>5</th>`).join('')}</tr>
                    </thead>
                    <tbody>
                        ${rows.map(row => {
                            let cells = '';
                            relevantMonths.forEach(m => {
                                const alloc = row.scheduleAllocation?.find(s => s.month === m);
                                const weeks = alloc ? alloc.weeks : [];
                                for (let w = 1; w <= 5; w++) {
                                    cells += `<td style="text-align:center;">${weeks.includes(w) ? 'X' : ''}</td>`;
                                }
                            });
                            const isSpecial = row.isAssessment || row.assessmentType === 'Cadangan';
                            const title = isSpecial ? `<strong>${row.assessmentType || row.materi}</strong>` : row.tujuanPembelajaran;
                            return `<tr><td>${row.no}</td><td>${row.materi}<br/>${title}</td><td>${row.alokasiWaktu}</td>${cells}</tr>`;
                        }).join('')}
                    </tbody>
                </table>
            `;
        });
    });

    let mingguEfektifTables = '';
    if (result.mingguEfektif && result.mingguEfektif.length > 0) {
        mingguEfektifTables = `<div class="page-break"></div><h3>5. PERHITUNGAN MINGGU EFEKTIF (RPE)</h3>`;
        [1, 2].forEach(sem => {
            const rows = result.mingguEfektif.filter(r => r.semester === sem);
            if (rows.length === 0) return;
            const totalMinggu = rows.reduce((sum, r) => sum + (Number(r.jumlahMinggu) || 0), 0);
            const totalEfektif = rows.reduce((sum, r) => sum + (Number(r.mingguEfektif) || 0), 0);
            const totalTidakEfektif = rows.reduce((sum, r) => sum + (Number(r.mingguTidakEfektif) || 0), 0);
            
            mingguEfektifTables += `
                <h4>SEMESTER ${sem === 1 ? 'GANJIL (I)' : 'GENAP (II)'}</h4>
                <table>
                    <thead>
                        <tr>
                            <th>No</th><th>Bulan</th><th>Jumlah Minggu</th><th>Minggu Efektif</th><th>Minggu Tidak Efektif</th><th>Keterangan / Kegiatan</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map((row, idx) => `
                            <tr>
                                <td style="text-align:center;">${idx + 1}</td>
                                <td>${row.bulan}</td>
                                <td style="text-align:center;">${row.jumlahMinggu}</td>
                                <td style="text-align:center; font-weight:bold; color:#059669;">${row.mingguEfektif}</td>
                                <td style="text-align:center; font-weight:bold; color:#d97706;">${row.mingguTidakEfektif}</td>
                                <td>${row.keterangan || ''}</td>
                            </tr>
                        `).join('')}
                        <tr style="background-color: #f8fafc; font-weight: bold;">
                            <td colspan="2" style="text-align:right;">TOTAL</td>
                            <td style="text-align:center;">${totalMinggu}</td>
                            <td style="text-align:center; color:#059669;">${totalEfektif}</td>
                            <td style="text-align:center; color:#d97706;">${totalTidakEfektif}</td>
                            <td>Analisis Pekan Efektif KBM</td>
                        </tr>
                    </tbody>
                </table>
            `;
        });
    }

    const fullContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>Export ATP PROTA PROSEM RPE</title>${style}</head>
        <body>${headerContent}${tpTable}${atpTables}${protaTables}${prosemTables}${mingguEfektifTables}</body>
      </html>
    `;

    const blob = new Blob([fullContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PERANGKAT_AJAR_${formData.schoolName.replace(/\s+/g, '_')}_LENGKAP.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const clearData = () => {
    if (confirm("Hapus semua data yang tersimpan?")) {
        localStorage.removeItem(STORAGE_KEY_RESULT);
        setResult(null);
        setIsSaved(false);
    }
  };

  const renderConfig = () => (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold mb-4 flex items-center text-emerald-600">
            <Settings className="w-5 h-5 mr-2" /> Konfigurasi Kurikulum
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label className="block text-sm font-medium text-slate-700">Nama Madrasah / Sekolah</label>
                <input 
                    type="text" 
                    className="mt-1 w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={formData.schoolName}
                    onChange={(e) => handleInputChange('schoolName', e.target.value)}
                    placeholder="Contoh: MA BANU HASYIM"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700">Mata Pelajaran</label>
                <input 
                    type="text" 
                    className="mt-1 w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={formData.subject}
                    onChange={(e) => handleInputChange('subject', e.target.value)}
                    placeholder="Contoh: Matematika"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700">Fase</label>
                <select 
                    className="mt-1 w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={formData.phase}
                    onChange={(e) => handleInputChange('phase', e.target.value)}
                >
                    {Object.keys(PHASES).map(p => (
                        <option key={p} value={p}>Fase {p} (Kelas {PHASES[p as Phase].join('-')})</option>
                    ))}
                </select>
            </div>

            <div>
                 <label className="block text-sm font-medium text-slate-700">Metode Penyusunan ATP</label>
                 <select 
                    className="mt-1 w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={formData.atpMethod}
                    onChange={(e) => handleInputChange('atpMethod', e.target.value)}
                >
                    {Object.values(ATPMethod).map(m => (
                        <option key={m} value={m}>{m}</option>
                    ))}
                </select>
            </div>
        </div>

        <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700">Capaian Pembelajaran (CP)</label>
            <textarea 
                className="mt-1 w-full p-2 border border-slate-300 rounded h-24 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                value={formData.cp}
                onChange={(e) => handleInputChange('cp', e.target.value)}
                placeholder="Tempel teks CP di sini..."
            />
        </div>

        <div className="mt-4 p-4 bg-emerald-50/50 rounded-md">
            <div className="font-semibold text-emerald-800 mb-2">Struktur Waktu & JP</div>
            <div className="space-y-4">
                {PHASES[formData.phase].map(cls => (
                    <div key={cls} className="grid grid-cols-2 gap-4 p-3 bg-white rounded border border-slate-200">
                        <div className="col-span-2 font-bold text-emerald-700 text-xs uppercase tracking-wider">Kelas {cls}</div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600">JP / Tahun</label>
                            <input 
                                type="number" 
                                className="mt-1 w-full p-2 border border-slate-300 rounded text-sm"
                                value={formData.classJpMap[cls] || ''}
                                onChange={(e) => handleJpChange(cls, parseInt(e.target.value) || 0)}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600">JP / Pertemuan</label>
                            <input 
                                type="number" 
                                className="mt-1 w-full p-2 border border-slate-300 rounded text-sm"
                                value={formData.jpPerMeeting[cls] || ''}
                                onChange={(e) => handleJpPerMeetingChange(cls, parseInt(e.target.value) || 0)}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>

        <div className="mt-4 p-4 bg-emerald-50/50 rounded-md">
             <div className="font-semibold text-emerald-800 mb-2">Jadwal Asesmen (Estimasi)</div>
             <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                    { label: 'STS 1', key: 'sts1' },
                    { label: 'STS 2', key: 'sts2' },
                    { label: 'SAS', key: 'sas' },
                    { label: 'SAT', key: 'sat' }
                ].map(item => (
                    <div key={item.key} className="bg-white p-2 rounded border border-slate-200">
                        <div className="text-xs font-bold text-slate-500 mb-1">{item.label}</div>
                        <select 
                            className="w-full text-xs p-1 mb-1 border rounded outline-none focus:ring-1 focus:ring-emerald-500"
                            value={(formData as any)[item.key].month}
                            onChange={(e) => handleAssessmentChange(item.key as any, 'month', e.target.value)}
                        >
                            {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <select 
                            className="w-full text-xs p-1 border rounded outline-none focus:ring-1 focus:ring-emerald-500"
                            value={(formData as any)[item.key].week}
                            onChange={(e) => handleAssessmentChange(item.key as any, 'week', parseInt(e.target.value))}
                        >
                            {[1, 2, 3, 4, 5].map(w => <option key={w} value={w}>Mg {w}</option>)}
                        </select>
                    </div>
                ))}
             </div>
        </div>

        <div className="mt-6 flex flex-col gap-2">
            <button 
                onClick={generateCurriculum}
                disabled={loading}
                className={`w-full py-3 px-4 rounded-lg font-bold text-white flex items-center justify-center transition-all ${loading ? 'bg-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 shadow-md'}`}
            >
                {loading ? <Loader2 className="animate-spin mr-2" /> : <BookOpen className="mr-2" />}
                {loading ? 'Sedang Menyusun Kurikulum...' : 'GENERATE ATP & PROSEM'}
            </button>
            {result && (
                <button 
                    onClick={clearData}
                    className="w-full py-2 px-4 rounded-lg font-medium text-slate-500 flex items-center justify-center hover:bg-slate-100 transition-all text-xs"
                >
                    <RotateCcw className="w-3 h-3 mr-1" /> Bersihkan Hasil
                </button>
            )}
            {error && <div className="mt-3 text-red-600 text-sm text-center bg-red-50 p-2 rounded">{error}</div>}
        </div>
    </div>
  );

  const EditableCell = ({ value, onChange, type = 'text', isTextArea = false }: { value: any, onChange: (val: any) => void, type?: string, isTextArea?: boolean }) => {
    if (isTextArea) {
        return (
            <textarea 
                className="w-full min-h-[40px] p-1 border-0 bg-transparent focus:bg-white focus:ring-1 focus:ring-emerald-200 outline-none resize-none transition-all text-inherit overflow-hidden"
                value={value}
                rows={1}
                onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = target.scrollHeight + 'px';
                }}
                onChange={(e) => onChange(e.target.value)}
            />
        );
    }
    return (
        <input 
            type={type}
            className="w-full p-1 border-0 bg-transparent focus:bg-white focus:ring-1 focus:ring-emerald-200 outline-none transition-all text-inherit"
            value={value}
            onChange={(e) => onChange(type === 'number' ? parseInt(e.target.value) || 0 : e.target.value)}
        />
    );
  };

  const renderResult = () => {
    if (!result) return (
        <div className="flex flex-col items-center justify-center h-[500px] text-slate-400 p-12 bg-white rounded-lg border border-slate-200 border-dashed">
            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-4 border border-emerald-100">
                <Globe className="w-10 h-10 text-emerald-300" />
            </div>
            <p className="text-lg font-medium text-slate-600">Belum ada data kurikulum</p>
            <p className="text-sm text-center max-w-xs">Data yang Anda generate akan muncul di sini. Silakan simpan hasil ke browser secara manual jika dikehendaki.</p>
        </div>
    );

    return (
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap gap-4 justify-between items-center bg-emerald-50/50">
              <div className="flex flex-wrap gap-1 p-1 bg-slate-200/50 rounded-lg">
              {([
                { id: 'TP', label: 'TP' },
                { id: 'ATP', label: 'ATP' },
                { id: 'PROTA', label: 'PROTA' },
                { id: 'PROSEM', label: 'PROSEM' },
                { id: 'EFEKTIF', label: 'MINGGU EFEKTIF' }
              ] as const).map(tab => (
                  <button 
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-emerald-600'}`}
                  >
                      {tab.label}
                  </button>
              ))}
           </div>
           <div className="flex items-center space-x-2">
                {isSaved ? (
                    <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider hidden sm:inline-flex items-center bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Tersimpan di Browser
                    </span>
                ) : (
                    <button 
                        onClick={saveToBrowser}
                        className="flex items-center space-x-1 px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded transition-all text-[11px] font-bold shadow-sm"
                        title="Simpan perubahan/hasil kurikulum ke memory browser"
                    >
                        <Save className="w-3 h-3 mr-1" />
                        <span>Simpan ke Browser</span>
                    </button>
                )}
                <button 
                    onClick={exportToWord}
                    className="flex items-center space-x-2 px-4 py-2 bg-emerald-700 text-white rounded-md hover:bg-emerald-800 transition-all text-sm font-bold shadow-sm"
                >
                    <FileDown className="w-4 h-4" />
                    <span>Download Word</span>
                </button>
           </div>
        </div>

        <div className="p-4 overflow-x-auto custom-scrollbar">
            {activeTab === 'TP' && (
                <table className="min-w-full text-sm border-collapse table-fixed">
                    <thead>
                        <tr className="bg-emerald-50">
                            <th className="border p-2 text-left w-12 text-emerald-800 font-bold">No</th>
                            <th className="border p-2 text-left w-32 text-emerald-800 font-bold">Elemen</th>
                            <th className="border p-2 text-left w-64 text-emerald-800 font-bold">Capaian Pembelajaran</th>
                            <th className="border p-2 text-left w-32 text-emerald-800 font-bold">Materi</th>
                            <th className="border p-2 text-left w-32 text-emerald-800 font-bold">Kompetensi</th>
                            <th className="border p-2 text-left w-64 text-emerald-800 font-bold">Tujuan Pembelajaran</th>
                        </tr>
                    </thead>
                    <tbody>
                        {result.tujuanPembelajaran.map((row, idx) => (
                            <tr key={idx} className="hover:bg-emerald-50/30">
                                <td className="border p-1 text-center"><EditableCell value={row.no} onChange={(v) => updateResult('tujuanPembelajaran', idx, 'no', v)} type="number" /></td>
                                <td className="border p-1"><EditableCell value={row.elemen} onChange={(v) => updateResult('tujuanPembelajaran', idx, 'elemen', v)} isTextArea /></td>
                                <td className="border p-1"><EditableCell value={row.capaianPembelajaran} onChange={(v) => updateResult('tujuanPembelajaran', idx, 'capaianPembelajaran', v)} isTextArea /></td>
                                <td className="border p-1"><EditableCell value={row.materi} onChange={(v) => updateResult('tujuanPembelajaran', idx, 'materi', v)} isTextArea /></td>
                                <td className="border p-1"><EditableCell value={row.kompetensi} onChange={(v) => updateResult('tujuanPembelajaran', idx, 'kompetensi', v)} isTextArea /></td>
                                <td className="border p-1"><EditableCell value={row.tujuanPembelajaran} onChange={(v) => updateResult('tujuanPembelajaran', idx, 'tujuanPembelajaran', v)} isTextArea /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {activeTab === 'ATP' && (
                <table className="min-w-full text-xs border-collapse">
                     <thead>
                        <tr className="bg-emerald-50">
                            <th className="border p-2 w-10 text-emerald-800 font-bold">Kls</th>
                            <th className="border p-2 w-10 text-emerald-800 font-bold">Smt</th>
                            <th className="border p-2 text-emerald-800 font-bold">Materi & Tujuan Pembelajaran</th>
                            <th className="border p-2 w-16 text-emerald-800 font-bold">JP</th>
                            <th className="border p-2 text-emerald-800 font-bold">Asesmen (F / S)</th>
                            <th className="border p-2 text-emerald-800 font-bold">Profil Lulusan / Panca Cinta</th>
                        </tr>
                    </thead>
                    <tbody>
                         {result.atp.map((row, idx) => (
                            <tr key={idx} className="hover:bg-emerald-50/30">
                                <td className="border p-1 text-center"><EditableCell value={row.kelas} onChange={(v) => updateResult('atp', idx, 'kelas', v)} /></td>
                                <td className="border p-1 text-center"><EditableCell value={row.semester} onChange={(v) => updateResult('atp', idx, 'semester', v)} type="number" /></td>
                                <td className="border p-1">
                                    <div className="font-bold text-emerald-800"><EditableCell value={row.materi} onChange={(v) => updateResult('atp', idx, 'materi', v)} isTextArea /></div>
                                    <div className="text-slate-600 border-t border-slate-100 mt-1"><EditableCell value={row.tujuanPembelajaran} onChange={(v) => updateResult('atp', idx, 'tujuanPembelajaran', v)} isTextArea /></div>
                                </td>
                                <td className="border p-1 text-center font-bold text-emerald-600">
                                    <EditableCell value={row.alokasiWaktu} onChange={(v) => updateResult('atp', idx, 'alokasiWaktu', v)} type="number" />
                                </td>
                                <td className="border p-1">
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-start"><span className="font-bold text-emerald-700 mr-1">F:</span><EditableCell value={row.asesmenFormatif} onChange={(v) => updateResult('atp', idx, 'asesmenFormatif', v)} isTextArea /></div>
                                        <div className="flex items-start border-t border-slate-100 pt-1"><span className="font-bold text-emerald-700 mr-1">S:</span><EditableCell value={row.asesmenSumatif} onChange={(v) => updateResult('atp', idx, 'asesmenSumatif', v)} isTextArea /></div>
                                    </div>
                                </td>
                                <td className="border p-1">
                                    <div className="flex flex-col gap-1 text-[10px]">
                                        <div className="p-1 bg-slate-50 rounded"><EditableCell value={row.profilLulusan.join(', ')} onChange={(v) => updateResult('atp', idx, 'profilLulusan', v.split(',').map((s: string) => s.trim()))} isTextArea /></div>
                                        <div className="p-1 bg-emerald-50 rounded"><EditableCell value={row.topikPancaCinta.join(', ')} onChange={(v) => updateResult('atp', idx, 'topikPancaCinta', v.split(',').map((s: string) => s.trim()))} isTextArea /></div>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {activeTab === 'PROTA' && (
                <div className="space-y-8">
                    {Array.from(new Set(result.prota.map(p => p.kelas))).sort().map(cls => {
                        const rows = result.prota.filter(r => r.kelas == cls);
                        return (
                            <div key={cls} className="bg-white rounded-xl border border-emerald-100 overflow-hidden shadow-sm">
                                <div className="bg-emerald-600 px-4 py-3 text-white">
                                    <h4 className="font-bold text-base">PROGRAM TAHUNAN (PROTA) KELAS {cls}</h4>
                                </div>
                                <div className="p-0 overflow-x-auto">
                                    <table className="w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50 text-slate-700">
                                                <th className="border p-2 w-12 text-center">No</th>
                                                <th className="border p-2 w-16 text-center">Smt</th>
                                                <th className="border p-2 text-left">Materi / Tujuan Pembelajaran</th>
                                                <th className="border p-2 w-20 text-center">JP</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.map((row, idx) => (
                                                <tr key={idx} className="hover:bg-emerald-50/20">
                                                    <td className="border p-1 text-center font-mono text-xs text-slate-400">
                                                        {idx + 1}
                                                    </td>
                                                    <td className="border p-1 text-center">
                                                        <EditableCell value={row.semester} onChange={(v) => updateResult('prota', result.prota.indexOf(row), 'semester', v)} type="number" />
                                                    </td>
                                                    <td className="border p-1">
                                                        <div className="font-bold text-slate-800">
                                                            <EditableCell value={row.materi} onChange={(v) => updateResult('prota', result.prota.indexOf(row), 'materi', v)} isTextArea />
                                                        </div>
                                                        <div className="text-slate-500 mt-1 border-t border-slate-50">
                                                            <EditableCell value={row.tujuanPembelajaran} onChange={(v) => updateResult('prota', result.prota.indexOf(row), 'tujuanPembelajaran', v)} isTextArea />
                                                        </div>
                                                    </td>
                                                    <td className="border p-1 text-center font-bold text-emerald-600">
                                                        <EditableCell value={row.alokasiWaktu} onChange={(v) => updateResult('prota', result.prota.indexOf(row), 'alokasiWaktu', v)} type="number" />
                                                    </td>
                                                </tr>
                                            ))}
                                            <tr className="bg-emerald-50/50 font-bold">
                                                <td colSpan={3} className="border p-2 text-right text-emerald-800">TOTAL JP / TAHUN</td>
                                                <td className="border p-2 text-center text-emerald-700">
                                                    {rows.reduce((sum, r) => sum + (Number(r.alokasiWaktu) || 0), 0)}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {activeTab === 'PROSEM' && (
                <div className="space-y-12">
                     {Array.from(new Set(result.prosem.map(p => `${p.kelas}-${p.semester}`))).sort((a: string, b: string) => {
                        const [cA, sA] = a.split('-').map(Number);
                        const [cB, sB] = b.split('-').map(Number);
                        if (cA !== cB) return (cA || 0) - (cB || 0);
                        return (sA || 0) - (sB || 0);
                     }).map(groupKey => {
                        const [cls, sem] = (groupKey as string).split('-');
                        const rowsWithIndices = result.prosem
                            .map((row, originalIndex) => ({ row, originalIndex }))
                            .filter(item => item.row.kelas == cls && item.row.semester == Number(sem));
                        
                        const relevantMonths = sem === '1' ? MONTHS.slice(0, 6) : MONTHS.slice(6, 12);

                        return (
                            <div key={groupKey as string} className="bg-white rounded-xl border border-emerald-100 overflow-hidden shadow-sm">
                                <div className="bg-emerald-600 px-4 py-3 text-white flex justify-between items-center">
                                    <h4 className="font-bold text-base">PROSEM KELAS {cls} - SEMESTER {sem}</h4>
                                    <span className="text-emerald-100 text-[10px] font-bold uppercase tracking-widest">Tersedia untuk diedit</span>
                                </div>
                                <div className="p-0 overflow-x-auto custom-scrollbar">
                                <table className="w-full text-[10px] border-collapse table-fixed">
                                    <thead>
                                        <tr className="bg-slate-50">
                                            <th className="border p-2 w-8 text-slate-600 font-bold" rowSpan={2}>NO</th>
                                            <th className="border p-2 w-48 text-slate-600 font-bold text-left" rowSpan={2}>MATERI / TP</th>
                                            <th className="border p-2 w-10 text-slate-600 font-bold" rowSpan={2}>JP</th>
                                            {relevantMonths.map(m => (
                                                <th key={m} className="border p-1 text-emerald-800 bg-emerald-50 font-black text-center" colSpan={5}>{m.toUpperCase()}</th>
                                            ))}
                                        </tr>
                                        <tr className="bg-slate-50">
                                            {relevantMonths.map(m => (
                                                <React.Fragment key={m + 'weeks'}>
                                                    {[1,2,3,4,5].map(w => (
                                                        <th key={w} className="border p-1 text-[8px] w-6 text-slate-400 font-bold">{w}</th>
                                                    ))}
                                                </React.Fragment>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rowsWithIndices.map(({ row, originalIndex }, idx) => {
                                            const isSpecial = row.isAssessment || row.assessmentType === 'Cadangan';
                                            return (
                                                <tr key={idx} className={`hover:bg-emerald-50/20 transition-colors ${isSpecial ? "bg-amber-50/50" : ""}`}>
                                                    <td className="border p-0 text-center text-slate-400">
                                                        <EditableCell value={row.no} onChange={(v) => updateResult('prosem', originalIndex, 'no', v)} type="number" />
                                                    </td>
                                                    <td className="border p-1">
                                                        <div className="font-bold text-slate-800">
                                                            <EditableCell 
                                                                value={row.assessmentType || row.materi} 
                                                                onChange={(v) => updateResult('prosem', originalIndex, row.assessmentType ? 'assessmentType' : 'materi', v)} 
                                                                isTextArea 
                                                            />
                                                        </div>
                                                        {!row.assessmentType && (
                                                            <div className="text-slate-500 mt-0.5 border-t border-slate-50">
                                                                <EditableCell 
                                                                    value={row.tujuanPembelajaran} 
                                                                    onChange={(v) => updateResult('prosem', originalIndex, 'tujuanPembelajaran', v)} 
                                                                    isTextArea 
                                                                />
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="border p-0 text-center font-bold">
                                                        <EditableCell value={row.alokasiWaktu} onChange={(v) => updateResult('prosem', originalIndex, 'alokasiWaktu', v)} type="number" />
                                                    </td>
                                                    {relevantMonths.map(m => {
                                                        const alloc = row.scheduleAllocation?.find(s => s.month === m);
                                                        const weeks = alloc ? alloc.weeks : [];
                                                        return (
                                                            <React.Fragment key={m}>
                                                                {[1,2,3,4,5].map(w => (
                                                                    <td 
                                                                        key={w} 
                                                                        onClick={() => toggleProsemWeek(originalIndex, m, w)}
                                                                        className={`border p-0 text-center cursor-pointer transition-colors ${weeks.includes(w) ? (isSpecial ? 'bg-amber-300' : 'bg-emerald-400') : 'hover:bg-slate-100'}`}
                                                                    >
                                                                        <div className="w-full h-6 flex items-center justify-center font-black text-white">
                                                                            {weeks.includes(w) ? (isSpecial ? '●' : 'X') : ''}
                                                                        </div>
                                                                    </td>
                                                                ))}
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                </div>
                            </div>
                        );
                     })}
                </div>
            )}

            {activeTab === 'EFEKTIF' && result.mingguEfektif && (
                <div className="space-y-8">
                    <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100 text-sm">
                        <h4 className="font-bold text-emerald-800 mb-1">Rincian Pekan Efektif (RPE)</h4>
                        <p className="text-slate-600 font-medium">Analisis alokasi waktu dan rincian minggu efektif untuk kegiatan belajar mengajar selama satu tahun ajaran.</p>
                    </div>

                    {[1, 2].map(sem => {
                        const rows = result.mingguEfektif.filter(r => r.semester === sem);
                        const totalMinggu = rows.reduce((sum, r) => sum + (Number(r.jumlahMinggu) || 0), 0);
                        const totalEfektif = rows.reduce((sum, r) => sum + (Number(r.mingguEfektif) || 0), 0);
                        const totalTidakEfektif = rows.reduce((sum, r) => sum + (Number(r.mingguTidakEfektif) || 0), 0);
                        return (
                            <div key={sem} className="bg-white rounded-xl border border-emerald-100 overflow-hidden shadow-sm">
                                <div className="bg-emerald-600 px-4 py-3 text-white flex justify-between items-center">
                                    <h4 className="font-bold text-base">SEMESTER {sem === 1 ? 'GANJIL (I)' : 'GENAP (II)'}</h4>
                                    <span className="text-emerald-100 text-[10px] font-bold uppercase tracking-widest">Tersedia untuk diedit</span>
                                </div>
                                <div className="p-0 overflow-x-auto">
                                    <table className="w-full text-sm border-collapse min-w-[600px]">
                                        <thead>
                                            <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                                                <th className="border p-2 w-16 text-center">No</th>
                                                <th className="border p-2 text-left">Nama Bulan</th>
                                                <th className="border p-2 w-32 text-center">Jml Minggu</th>
                                                <th className="border p-2 w-32 text-center">Minggu Efektif</th>
                                                <th className="border p-2 w-32 text-center">Minggu Tdk Efektif</th>
                                                <th className="border p-2 text-left">Keterangan / Kegiatan</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.map((row, idx) => (
                                                <tr key={idx} className="hover:bg-emerald-50/20 border-b border-slate-100">
                                                    <td className="border p-1 text-center font-mono text-xs text-slate-400 bg-slate-50/50">
                                                        {idx + 1}
                                                    </td>
                                                    <td className="border p-1 font-bold text-slate-700">
                                                        <EditableCell value={row.bulan} onChange={(v) => updateResult('mingguEfektif', result.mingguEfektif.indexOf(row), 'bulan', v)} />
                                                    </td>
                                                    <td className="border p-1 text-center font-mono text-slate-600">
                                                        <EditableCell value={row.jumlahMinggu} onChange={(v) => updateResult('mingguEfektif', result.mingguEfektif.indexOf(row), 'jumlahMinggu', v)} type="number" />
                                                    </td>
                                                    <td className="border p-1 text-center font-bold font-mono text-emerald-600">
                                                        <EditableCell value={row.mingguEfektif} onChange={(v) => updateResult('mingguEfektif', result.mingguEfektif.indexOf(row), 'mingguEfektif', v)} type="number" />
                                                    </td>
                                                    <td className="border p-1 text-center font-bold font-mono text-amber-600">
                                                        <EditableCell value={row.mingguTidakEfektif} onChange={(v) => updateResult('mingguEfektif', result.mingguEfektif.indexOf(row), 'mingguTidakEfektif', v)} type="number" />
                                                    </td>
                                                    <td className="border p-1">
                                                        <EditableCell value={row.keterangan} onChange={(v) => updateResult('mingguEfektif', result.mingguEfektif.indexOf(row), 'keterangan', v)} isTextArea />
                                                    </td>
                                                </tr>
                                            ))}
                                            <tr className="bg-emerald-50/40 text-slate-800 font-bold">
                                                <td colSpan={2} className="border p-2.5 text-right text-emerald-800 uppercase tracking-wider text-xs">TOTAL KUMULATIF</td>
                                                <td className="border p-2.5 text-center font-mono text-emerald-900">{totalMinggu}</td>
                                                <td className="border p-2.5 text-center font-mono text-emerald-700">{totalEfektif}</td>
                                                <td className="border p-2.5 text-center font-mono text-amber-700">{totalTidakEfektif}</td>
                                                <td className="border p-2.5 text-slate-500 font-normal italic text-[11px] bg-slate-50/50">Minggu Pekan Efektif KBM Terkalkulasi</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <header className="bg-emerald-700 text-white shadow-lg py-6 mb-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center space-y-4 md:space-y-0 md:space-x-6">
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center p-2 shadow-inner border-4 border-emerald-800 shrink-0">
                <Globe size={32} className="text-emerald-600" />
            </div>
            <div className="text-center md:text-left">
                <h1 className="text-2xl md:text-3xl font-black tracking-tight uppercase">SEKOLAH DAN MADRASAH</h1>
                <div className="flex items-center justify-center md:justify-start space-x-2 mt-1">
                    <GraduationCap className="text-emerald-200" size={18} />
                    <p className="text-emerald-50 text-base md:text-lg font-bold">TEACHFLOW GEN. ATP</p>
                </div>
                <p className="text-emerald-200 text-[10px] mt-1 uppercase tracking-[0.2em] font-black opacity-80">Smart Curriculum System for SD/MI</p>
            </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 pb-12 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 xl:col-span-4 space-y-6">
            {renderConfig()}
            
            <div className="p-5 bg-white border border-emerald-100 rounded-xl shadow-sm text-xs">
                <h4 className="font-bold flex items-center text-emerald-800 mb-3 text-sm">
                    <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600" />
                    Panduan Edit Data
                </h4>
                <ul className="space-y-3 text-slate-600">
                    <li className="flex items-start">
                        <span className="w-4 h-4 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-[8px] font-bold mr-2 mt-0.5 shrink-0">1</span>
                        <span>Klik pada teks di dalam tabel untuk mengedit langsung.</span>
                    </li>
                    <li className="flex items-start">
                        <span className="w-4 h-4 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-[8px] font-bold mr-2 mt-0.5 shrink-0">2</span>
                        <span>Pada tabel <strong>PROSEM</strong>, klik sel minggu (angka 1-5) untuk menandai jadwal.</span>
                    </li>
                    <li className="flex items-start">
                        <span className="w-4 h-4 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-[8px] font-bold mr-2 mt-0.5 shrink-0">3</span>
                        <span>Gunakan tombol <strong>"Simpan ke Browser"</strong> untuk menyimpan hasil secara manual agar pekerjaan tersimpan aman di perangkat Anda.</span>
                    </li>
                </ul>
            </div>
        </div>

        <div className="lg:col-span-7 xl:col-span-8">
            {renderResult()}
        </div>
      </main>
      
      <footer className="max-w-7xl mx-auto px-6 py-8 border-t border-slate-200 text-center text-slate-400 text-[10px] font-bold uppercase tracking-widest">
        <p>© 2024 SEKOLAH DAN MADRASAH - Sistem Pengembang Kurikulum</p>
      </footer>
    </div>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
