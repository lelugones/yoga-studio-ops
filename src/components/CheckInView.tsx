'use client';

import React, { useState, useEffect } from 'react';
import { 
  Check, 
  RotateCcw, 
  AlertTriangle, 
  UserPlus, 
  Users, 
  Clock, 
  Sparkles,
  ChevronRight
} from 'lucide-react';

interface StudentReservation {
  id: string;
  studentId: string;
  fullName: string;
  phone: string;
  remainingCredits: number;
  packageExpiresAt: string;
  status: 'RESERVED' | 'ATTENDED';
  attendanceId?: string;
  attendedAt?: number; // timestamp en ms para calcular los 60s
}

interface CheckInViewProps {
  sessionId: string;
  sessionTime: string;
  instructorName: string;
  initialReservations: StudentReservation[];
  onCheckIn: (studentId: string) => Promise<{ attendanceId: string; remainingCredits: number }>;
  onUndo: (attendanceId: string) => Promise<void>;
  onWalkIn?: (studentId: string) => Promise<void>;
}

export const CheckInView: React.FC<CheckInViewProps> = ({
  sessionTime = '19:00 - 20:15',
  instructorName = 'Clara M.',
  initialReservations = [],
  onCheckIn,
  onUndo,
}) => {
  const [reservations, setReservations] = useState<StudentReservation[]>(initialReservations);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Actualizar reloj cada segundo para controlar la ventana de 60 segundos del botón Deshacer (AC-4)
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const MAX_CAPACITY = 12;
  const attendedCount = reservations.filter((r) => r.status === 'ATTENDED').length;
  const isClassFull = attendedCount >= MAX_CAPACITY;

  const handleAttendance = async (student: StudentReservation) => {
    setErrorBanner(null);

    // AC-3: Validación de cupo estricto
    if (student.status !== 'ATTENDED' && isClassFull) {
      setErrorBanner(`Cupo completo (${MAX_CAPACITY}/${MAX_CAPACITY}). Solo disponible lista de espera.`);
      return;
    }

    // AC-2: Bloqueo por saldo agotado o fecha vencida
    const isExpired = new Date(student.packageExpiresAt).getTime() < Date.now();
    if (student.remainingCredits <= 0 || isExpired) {
      setErrorBanner(`No se puede registrar a ${student.fullName}: Crédito agotado o paquete vencido.`);
      return;
    }

    try {
      setLoadingId(student.id);
      const res = await onCheckIn(student.studentId);

      // AC-1: Actualización de estado local con débito atómico reflejado
      setReservations((prev) =>
        prev.map((item) =>
          item.id === student.id
            ? {
                ...item,
                status: 'ATTENDED',
                attendanceId: res.attendanceId,
                remainingCredits: res.remainingCredits,
                attendedAt: Date.now(),
              }
            : item
        )
      );
    } catch (err: any) {
      setErrorBanner(err.message || 'Error al procesar la asistencia.');
    } finally {
      setLoadingId(null);
    }
  };

  const handleUndo = async (student: StudentReservation) => {
    if (!student.attendanceId) return;
    setErrorBanner(null);

    try {
      setLoadingId(student.id);
      await onUndo(student.attendanceId);

      // AC-4: Restauración de crédito y estado
      setReservations((prev) =>
        prev.map((item) =>
          item.id === student.id
            ? {
                ...item,
                status: 'RESERVED',
                attendanceId: undefined,
                remainingCredits: item.remainingCredits + 1,
                attendedAt: undefined,
              }
            : item
        )
      );
    } catch (err: any) {
      setErrorBanner(err.message || 'La ventana de reversión de 60s ha expirado.');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBF9F5] text-[#2A3430] font-sans antialiased pb-24">
      {/* Barra superior fija de sala */}
      <header className="sticky top-0 z-30 bg-[#FBF9F5]/90 backdrop-blur-md border-b border-[#EBE6DD] px-4 py-3.5">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-[#6B7570]">
              <Clock className="w-3.5 h-3.5" />
              <span>{sessionTime}</span>
              <span>•</span>
              <span>{instructorName}</span>
            </div>
            <h1 className="font-serif text-xl font-semibold tracking-tight text-[#2A3430] mt-0.5">
              Lista de Asistencia
            </h1>
          </div>

          {/* Contador de cupo en tiempo real (AC-3) */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold ${
              isClassFull
                ? 'bg-[#FBEBEB] text-[#A34343] border-[#F2D6D6]'
                : 'bg-[#EAF3EE] text-[#3D6B52] border-[#D3E5DB]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>
              {attendedCount}/{MAX_CAPACITY}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-4 space-y-3">
        {/* Banner de error o alerta de reglas */}
        {errorBanner && (
          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[#FBEBEB] border border-[#F2D6D6] text-[#A34343] text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{errorBanner}</div>
          </div>
        )}

        {/* Tarjetas de alumnas registradas */}
        <div className="space-y-2.5">
          {reservations.map((student) => {
            const isAttended = student.status === 'ATTENDED';
            const isExpired = new Date(student.packageExpiresAt).getTime() < Date.now();
            const hasNoCredit = student.remainingCredits <= 0;
            const isBlocked = !isAttended && (hasNoCredit || isExpired);

            // Cálculo ventana AC-4 (60 segundos para reversión)
            const secondsLeft = student.attendedAt
              ? Math.max(0, 60 - Math.floor((currentTime - student.attendedAt) / 1000))
              : 0;
            const canUndo = isAttended && secondsLeft >