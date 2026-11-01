'use client';

import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { CheckInView } from './CheckInView';
import { EmergencyBroadcastModal } from './EmergencyBroadcastModal';

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

const reservations = [
  { id: 'r1', studentId: 's1', fullName: 'Lucía Fernández', phone: '+5493871234501', remainingCredits: 5, packageExpiresAt: inDays(30), status: 'RESERVED' as const },
  { id: 'r2', studentId: 's2', fullName: 'Marina Torres', phone: '+5493871234502', remainingCredits: 1, packageExpiresAt: inDays(12), status: 'RESERVED' as const },
  { id: 'r3', studentId: 's3', fullName: 'Camila Ríos', phone: '+5493871234503', remainingCredits: 0, packageExpiresAt: inDays(20), status: 'RESERVED' as const },
  { id: 'r4', studentId: 's4', fullName: 'Sofía Aguirre', phone: '+5493871234504', remainingCredits: 3, packageExpiresAt: inDays(-4), status: 'RESERVED' as const },
  { id: 'r5', studentId: 's5', fullName: 'Valentina Paz', phone: '+5493871234505', remainingCredits: 8, packageExpiresAt: inDays(45), status: 'RESERVED' as const },
];

export function CheckInDemo() {
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);
  const credits = new Map(reservations.map((r) => [r.studentId, r.remainingCredits]));

  const handleCheckIn = async (studentId: string) => {
    const remainingCredits = (credits.get(studentId) ?? 1) - 1;
    credits.set(studentId, remainingCredits);
    return { attendanceId: `att-${studentId}-${Date.now()}`, remainingCredits };
  };

  const handleUndo = async () => {};

  return (
    <>
      <CheckInView
        sessionId="demo-session"
        sessionTime="19:00 - 20:15"
        instructorName="Clara M."
        initialReservations={reservations}
        onCheckIn={handleCheckIn}
        onUndo={handleUndo}
      />
      <button
        type="button"
        onClick={() => setIsBroadcastOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex h-11 items-center gap-2 rounded-xl bg-[#3D5A50] px-4 text-sm font-medium text-white shadow-[0_4px_20px_-4px_rgba(42,52,48,0.06)] hover:bg-[#324B42]"
      >
        <MessageCircle className="h-4 w-4" />
        Aviso urgente
      </button>
      <EmergencyBroadcastModal
        isOpen={isBroadcastOpen}
        onClose={() => setIsBroadcastOpen(false)}
        sessionTime="19:00"
        instructorName="Clara M."
        recipients={reservations.map((r) => ({
          id: r.id,
          fullName: r.fullName,
          phone: r.phone,
          status: 'RESERVED' as const,
        }))}
      />
    </>
  );
}
