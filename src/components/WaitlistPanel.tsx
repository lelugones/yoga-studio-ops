'use client';

import { useEffect, useState } from 'react';
import { Clock, MessageCircle, UserPlus, X } from 'lucide-react';

export interface WaitlistEntryView {
  id: string;
  studentId: string;
  fullName: string;
  status: 'WAITING' | 'OFFERED';
  queuePosition: number;
  offerExpiresAt: string | null;
  whatsappUrl: string | null;
}

export interface WaitlistCandidate {
  id: string;
  fullName: string;
}

interface WaitlistPanelProps {
  entries: WaitlistEntryView[];
  maxEntries: number;
  isSessionFull: boolean;
  candidates: WaitlistCandidate[];
  onJoin: (studentId: string) => Promise<void> | void;
  onAccept: (entryId: string) => Promise<void> | void;
  onDecline: (entryId: string) => Promise<void> | void;
  onCancel: (entryId: string) => Promise<void> | void;
  error?: string | null;
}

function formatCountdown(msLeft: number) {
  const totalSeconds = Math.max(0, Math.floor(msLeft / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const msLeft = new Date(expiresAt).getTime() - now;
  return (
    <span className="flex items-center gap-1 text-xs font-medium tabular-nums text-[#A9742B]" aria-live="off">
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      {msLeft > 0 ? `Responde en ${formatCountdown(msLeft)}` : 'Oferta vencida'}
    </span>
  );
}

export function WaitlistPanel({
  entries,
  maxEntries,
  isSessionFull,
  candidates,
  onJoin,
  onAccept,
  onDecline,
  onCancel,
  error,
}: WaitlistPanelProps) {
  const [selectedStudent, setSelectedStudent] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const isListFull = entries.length >= maxEntries;
  const queued = new Set(entries.map((entry) => entry.studentId));
  const availableCandidates = candidates.filter((candidate) => !queued.has(candidate.id));

  const run = async (id: string, action: () => Promise<void> | void) => {
    setBusyId(id);
    try {
      await action();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section
      aria-labelledby="waitlist-heading"
      className="rounded-2xl border border-[#EBE6DD] bg-white p-4 shadow-[0_4px_20px_-4px_rgba(42,52,48,0.06)]"
    >
      <div className="flex items-center justify-between">
        <h2 id="waitlist-heading" className="text-sm font-semibold text-[#2A3430]">
          Lista de espera ({entries.length}/{maxEntries})
        </h2>
        {isListFull && <span className="text-xs font-medium text-[#A34343]">Lista completa</span>}
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-[#F2D6D6] bg-[#FBEBEB] p-3 text-xs text-[#A34343]">
          {error}
        </p>
      )}

      {entries.length === 0 ? (
        <p className="mt-3 text-xs text-[#6B7570]">Nadie en espera.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-xl border border-[#EBE6DD] bg-[#FBF9F5] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-[#2A3430]">
                  <span className="mr-2 text-[#6B7570]">#{entry.queuePosition}</span>
                  {entry.fullName}
                </p>
                <button
                  type="button"
                  onClick={() => run(entry.id, () => onCancel(entry.id))}
                  disabled={busyId === entry.id}
                  aria-label={`Quitar a ${entry.fullName} de la lista`}
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-[#6B7570] hover:bg-white disabled:opacity-50"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              {entry.status === 'OFFERED' && entry.offerExpiresAt && (
                <div className="mt-2 flex flex-col gap-2">
                  <Countdown expiresAt={entry.offerExpiresAt} />
                  <div className="flex flex-wrap gap-2">
                    {entry.whatsappUrl && (
                      <a
                        href={entry.whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-11 items-center gap-1.5 rounded-xl bg-[#3D5A50] px-4 text-xs font-medium text-white hover:bg-[#324B42]"
                      >
                        <MessageCircle className="h-4 w-4" aria-hidden="true" />
                        Enviar WhatsApp
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => run(entry.id, () => onAccept(entry.id))}
                      disabled={busyId === entry.id}
                      className="h-11 rounded-xl border border-[#3D5A50] px-4 text-xs font-medium text-[#3D5A50] hover:bg-white disabled:opacity-50"
                    >
                      Confirmó
                    </button>
                    <button
                      type="button"
                      onClick={() => run(entry.id, () => onDecline(entry.id))}
                      disabled={busyId === entry.id}
                      className="h-11 rounded-xl border border-[#EBE6DD] px-4 text-xs font-medium text-[#6B7570] hover:bg-white disabled:opacity-50"
                    >
                      No puede
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {isSessionFull && !isListFull && availableCandidates.length > 0 && (
        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!selectedStudent) return;
            void run('join', async () => {
              await onJoin(selectedStudent);
              setSelectedStudent('');
            });
          }}
        >
          <label htmlFor="waitlist-student" className="sr-only">
            Alumna a anotar en la lista de espera
          </label>
          <select
            id="waitlist-student"
            value={selectedStudent}
            onChange={(event) => setSelectedStudent(event.target.value)}
            className="h-11 min-w-0 flex-1 rounded-xl border border-[#EBE6DD] bg-white px-3 text-sm text-[#2A3430]"
          >
            <option value="">Elegir alumna</option>
            {availableCandidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.fullName}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={!selectedStudent || busyId === 'join'}
            className="flex h-11 items-center gap-1.5 rounded-xl bg-[#3D5A50] px-4 text-xs font-medium text-white hover:bg-[#324B42] disabled:opacity-50"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Anotar
          </button>
        </form>
      )}
    </section>
  );
}
