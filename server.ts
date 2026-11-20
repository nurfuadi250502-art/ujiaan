import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
  });
});

// Server-side Gemini Smart Question Parser endpoint
app.post('/api/ai/parse-questions', async (req, res) => {
  const { rawText } = req.body as { rawText?: string };

  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    res.status(400).json({ error: 'Teks soal mentah tidak boleh kosong.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    res.status(503).json({
      error: 'GEMINI_API_KEY_MISSING',
      message: 'Kunci API Gemini belum tersedia di server. Menggunakan parser berbasis aturan.',
    });
    return;
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const systemInstruction = [
      'Anda adalah AI Smart Question Parser untuk dokumen ujian sekolah Indonesia dan madrasah/pesantren (termasuk soal Bahasa Arab dan kitab).',
      'PRINSIP UTAMA (WAJIB DIPATUHI): PRESERVE ORIGINAL CONTENT.',
      '1. Ekstrak teks pertanyaan (stem), opsi jawaban (options), petunjuk pengerjaan, stimulus/bacaan, dan subsoal SECARA PERSIS (VERBATIM) sesuai teks input mentah.',
      '2. Untuk teks Bahasa Arab: PERTAHANKAN seluruh harakat/tashkeel (fathah, kasrah, dhammah, sukun, syaddah, tanwin) dan hamzah secara utuh tanpa menghapus atau menormalisasinya.',
      '3. DILARANG KERAS mengubah redaksi kalimat, memperbaiki ejaan, meringkas, menerjemahkan, atau mengarang pilihan jawaban yang hilang.',
      '4. Kenali format nomor soal Latin maupun Arab: 1., 1), Soal 1., ١., ١), السؤال ١., س١.',
      '5. Kenali format pilihan jawaban Latin maupun Arab: A./B./C./D./E., a./b./c./d., A)/B)/C)/D), serta أ./ب./ج./د./هـ. atau أ)/ب)/ج)/د).',
      '6. Kenali judul bab/bagian soal seperti "BAB I", "BAB II ...", "Bagian A ...", "A. ...", "B. ...", "لالف ) ...", "الباء ) ...", "الجيم ) ...", simpan di field sectionTitle pada setiap soal dalam bab/bagian tersebut; setiap mulai bab/bagian baru, nomor soal harus kembali urut dari 1 (atau ١) lagi dan BUKAN duplikasi.',
      '7. Pertahankan tag <u>...</u> jika terdapat kata yang digarisbawahi pada input.',
      '8. Klasifikasikan jenis soal secara akurat ke salah satu nilai: pilihan_ganda, pilihan_ganda_kompleks, benar_salah, menjodohkan, isian_singkat, uraian, esai.',
      '9. Jika ada nomor soal yang melompat atau duplikat DI DALAM BAGIAN YANG SAMA, pilihan jawaban tidak lengkap (misal A, B, D tanpa C atau أ, ب, د tanpa ج), atau struktur soal membingungkan, JANGAN tebak atau isi sendiri — tandai needsManualReview: true, tulis alasan pada reviewReason, dan masukkan ke daftar warnings.',
      '10. Deteksi jika ada baris header mata pelajaran di awal teks (misal "Mata Pelajaran: IPS" atau "المادة: الحديث").',
    ].join('\n');

    const requestConfig = {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          detectedSubject: {
            type: Type.STRING,
            description: 'Nama mata pelajaran yang tertulis di awal teks jika ada, kosongkan jika tidak ada.',
          },
          globalInstruction: {
            type: Type.STRING,
            description: 'Petunjuk pengerjaan umum jika ada di bagian atas teks.',
          },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                number: {
                  type: Type.INTEGER,
                  description: 'Nomor urut soal jika terdeteksi.',
                },
                originalNumberLabel: {
                  type: Type.STRING,
                  description: 'Label nomor asli seperti "1.", "2)", "Soal 1.", "١."',
                },
                sectionTitle: {
                  type: Type.STRING,
                  description: 'Judul bagian jika soal berada di bawah bagian seperti "لالف ) ..." atau "الباء ) ...".',
                },
                type: {
                  type: Type.STRING,
                  description: 'Salah satu dari: pilihan_ganda, pilihan_ganda_kompleks, benar_salah, menjodohkan, isian_singkat, uraian, esai',
                },
                stem: {
                  type: Type.STRING,
                  description: 'Teks inti pertanyaan persis seperti aslinya.',
                },
                options: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      label: { type: Type.STRING },
                      originalMarker: { type: Type.STRING },
                      text: { type: Type.STRING },
                    },
                    required: ['label', 'originalMarker', 'text'],
                  },
                },
                instruction: { type: Type.STRING },
                stimulus: { type: Type.STRING },
                subquestions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                hasTable: { type: Type.BOOLEAN },
                hasFormula: { type: Type.BOOLEAN },
                hasImageRef: { type: Type.BOOLEAN },
                needsManualReview: { type: Type.BOOLEAN },
                reviewReason: { type: Type.STRING },
                rawBlock: { type: Type.STRING },
              },
              required: ['originalNumberLabel', 'type', 'stem', 'options', 'needsManualReview', 'rawBlock'],
            },
          },
          warnings: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                severity: { type: Type.STRING },
                code: { type: Type.STRING },
                questionNumber: { type: Type.INTEGER },
                message: { type: Type.STRING },
              },
              required: ['severity', 'code', 'message'],
            },
          },
        },
        required: ['questions', 'warnings'],
      },
    };

    const contents = `Analisis dan susun struktur soal berikut tanpa mengubah satu kata pun dari substansi soal maupun opsi jawabannya:\n\n${rawText}`;
    const candidateModels = [
      { model: 'gemini-4-hydrogen', timeoutMs: 8000, useLowThinking: true },
      { model: 'gemini-3.1-flash-lite', timeoutMs: 25000, useLowThinking: false },
    ] as const;

    let responseText = '';
    let usedModel: string = candidateModels[0].model;
    let lastError: unknown = null;

    for (const candidate of candidateModels) {
      if (res.destroyed || res.writableEnded) break;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error(`Timeout after ${candidate.timeoutMs}ms`)), candidate.timeoutMs);
      let raceTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        const response = await Promise.race([
          ai.models.generateContent({
            model: candidate.model,
            contents,
            config: {
              ...requestConfig,
              ...(candidate.useLowThinking
                ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                : {}),
              abortSignal: controller.signal,
            },
          }),
          new Promise<never>((_resolve, reject) => {
            raceTimer = setTimeout(() => reject(new Error(`Timeout after ${candidate.timeoutMs}ms`)), candidate.timeoutMs + 250);
          }),
        ]);
        responseText = (response.text ?? '{}').trim();
        usedModel = candidate.model;
        lastError = null;
        break;
      } catch (modelErr) {
        lastError = modelErr;
        const msg = modelErr instanceof Error ? modelErr.message : String(modelErr);
        console.warn(`Model ${candidate.model} fallback (${msg})`);
      } finally {
        clearTimeout(timer);
        if (raceTimer) clearTimeout(raceTimer);
      }
    }

    if (res.destroyed || res.writableEnded) {
      return;
    }

    if (lastError) {
      throw lastError;
    }

    const parsed = JSON.parse(responseText || '{}');
    res.json({
      ...parsed,
      engine: 'gemini-ai',
      model: usedModel,
    });
  } catch (err) {
    if (res.destroyed || res.writableEnded || res.headersSent) return;
    const rawMessage = err instanceof Error ? err.message : 'Gagal menghubungi layanan AI Gemini.';
    const isTimeoutOrAbort =
      (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) ||
      /aborted|timeout/i.test(rawMessage);
    if (isTimeoutOrAbort) {
      console.warn('Gemini parse timeout, returning graceful fallback signal.');
      res.status(504).json({
        error: 'GEMINI_TIMEOUT',
        message: 'Analisis AI membutuhkan waktu terlalu lama; beralih otomatis ke parser berbasis aturan lokal yang akurat.',
      });
      return;
    }
    console.warn('Gemini parse fallback:', rawMessage);
    res.status(502).json({
      error: 'GEMINI_REQUEST_FAILED',
      message: 'Layanan AI Gemini sedang sibuk sementara; menggunakan parser berbasis aturan lokal yang akurat.',
    });
  }
});

async function startServer() {
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Smart Question Generator running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
