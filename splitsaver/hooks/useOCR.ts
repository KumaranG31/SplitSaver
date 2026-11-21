"use client";

import { createWorker, PSM, type Worker } from "tesseract.js";
import { useEffect, useState } from "react";
import { prepareForOcr } from "@/utils/ocrImage";
import type { VisualGuess } from "@/utils/brandColor";

export type OCRFileResult = {
  id?: string;
  file: File;
  fileName: string;
  text: string;
  visual?: VisualGuess;
};

export type OCRResult = {
  files: OCRFileResult[];
  text: string;
  completed: number;
};

type OCRState = {
  source: File[];
  result: OCRResult;
};

type OCRFailure = {
  source: File[];
  message: string;
};

const WORKER_PATH = "/ocr/worker.min.js";
const CORE_PATH = "/ocr/core";
const LANG_PATH = "/ocr/lang";

const textQuality = (text: string): number => {
  const lines = text.split(/\r?\n/).filter((line) => /\d/.test(line));
  const digits = text.match(/\d/g)?.length ?? 0;
  return lines.length * 2 + digits;
};

export const useOCR = (files: File[]) => {
  const [worker, setWorker] = useState<Worker | null>(null);
  const [initProgress, setInitProgress] = useState(0);
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [state, setState] = useState<OCRState | null>(null);
  const [failure, setFailure] = useState<OCRFailure | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: Worker | null = null;

    const init = async () => {
      try {
        const w = await createWorker("eng", undefined, {
          workerPath: WORKER_PATH,
          corePath: CORE_PATH,
          langPath: LANG_PATH,
          logger: (m) => {
            if (!cancelled) setInitProgress(Math.round((m.progress ?? 0) * 100));
          },
        });
        await w.setParameters({
          tessedit_pageseg_mode: PSM.SPARSE_TEXT,
          preserve_interword_spaces: "1",
          user_defined_dpi: "300",
        });
        if (cancelled) {
          await w.terminate();
          return;
        }
        created = w;
        setWorker(w);
      } catch (e) {
        if (!cancelled) setWorkerError(e instanceof Error ? e.message : String(e));
      }
    };

    void init();

    return () => {
      cancelled = true;
      void created?.terminate();
    };
  }, []);

  useEffect(() => {
    if (!worker || files.length === 0) return;
    let cancelled = false;

    const run = async () => {
      const chunks: OCRFileResult[] = [];
      for (const [index, file] of files.entries()) {
        const { image, visual } = await prepareForOcr(file);
        let text = (await worker.recognize(image)).data.text;

        if (textQuality(text) < 3) {
          await worker.setParameters({
            tessedit_pageseg_mode: PSM.AUTO,
            preserve_interword_spaces: "1",
            user_defined_dpi: "300",
          });
          const alternative = (await worker.recognize(image)).data.text;
          await worker.setParameters({
            tessedit_pageseg_mode: PSM.SPARSE_TEXT,
            preserve_interword_spaces: "1",
            user_defined_dpi: "300",
          });
          if (textQuality(alternative) > textQuality(text)) text = alternative;
        }

        if (cancelled) return;
        chunks.push({
          id: `${file.name}-${index}`,
          file,
          fileName: file.name,
          text,
          visual,
        });
        setState({
          source: files,
          result: {
            files: [...chunks],
            text: chunks.map((chunk) => chunk.text).join("\n"),
            completed: index + 1,
          },
        });
      }
    };

    void run().catch((e: unknown) => {
      if (!cancelled) {
        setState(null);
        setFailure({ source: files, message: e instanceof Error ? e.message : String(e) });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [files, worker]);

  const isCurrent = state !== null && state.source === files;
  const result = isCurrent ? state.result : null;
  const error = failure !== null && failure.source === files ? failure.message : workerError;

  const progress =
    files.length > 0 && result
      ? Math.round((result.completed / files.length) * 100)
      : initProgress;

  const isRecognizing =
    files.length > 0 &&
    error === null &&
    (!worker || result === null || result.completed < files.length);

  return {
    files: result?.files ?? [],
    text: result?.text ?? "",
    progress,
    error,
    isRecognizing,
  };
};
