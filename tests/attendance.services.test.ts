import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AttendanceService } from '../src/services/attendance.service';
import { PrismaClient, AttendanceStatus } from '@prisma/client';

// Mock de Prisma Client
vi.mock('@prisma/client', () => {
  const mPrisma = {
    $transaction: vi.fn((callback) => callback(mPrisma)),
    session: {
      findUnique: vi.fn(),
    },
    package: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    attendance: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };

  return {
    PrismaClient: vi.fn(() => mPrisma),
    AttendanceStatus: {
      ATTENDED: 'ATTENDED',
      REVERTED: 'REVERTED',
    },
  };
});

describe('AttendanceService - Spec-001 (AC-1 a AC-4)', () => {
  const prisma = new PrismaClient() as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // AC-1: Débito atómico de saldo, cambio de estado y log de auditoría
  describe('AC-1: Débito Atómico y Trazabilidad', () => {
    it('debe descontar 1 crédito, registrar asistencia como ATTENDED y reportar saldo', async () => {
      const mockSession = {
        id: 'session-123',
        capacity: 12,
        attendances: Array(5).fill({ status: AttendanceStatus.ATTENDED }),
      };

      const mockPackage = {
        id: 'pkg-1',
        studentId: 'student-abc',
        remainingCredits: 3,
        expiresAt: new Date(Date.now() + 86400000), // Mañana
        isActive: true,
      };

      prisma.session.findUnique.mockResolvedValue(mockSession);
      prisma.package.findFirst.mockResolvedValue(mockPackage);
      prisma.package.update.mockResolvedValue({ ...mockPackage, remainingCredits: 2 });
      prisma.attendance.create.mockResolvedValue({
        id: 'att-001',
        sessionId: 'session-123',
        studentId: 'student-abc',
        packageId: 'pkg-1',
        instructorId: 'inst-1',
        status: AttendanceStatus.ATTENDED,
        createdAt: new Date(),
      });

      const result = await AttendanceService.recordAttendance({
        sessionId: 'session-123',
        studentId: 'student-abc',
        instructorId: 'inst-1',
      });

      // Verificación de AC-1
      expect(prisma.package.update).toHaveBeenCalledWith({
        where: { id: 'pkg-1' },
        data: { remainingCredits: { decrement: 1 } },
      });

      expect(prisma.attendance.create).toHaveBeenCalledWith({
        data: {
          sessionId: 'session-123',
          studentId: 'student-abc',
          packageId: 'pkg-1',
          instructorId: 'inst-1',
          status: AttendanceStatus.ATTENDED,
        },
      });

      expect(result.success).toBe(true);
      expect(result.attendanceId).toBe('att-001');
      expect(result.remainingCredits).toBe(2);
      expect(result.alertLowCredits).toBe(true); // <= 2 dispara alerta de renovación
    });
  });

  // AC-2: Bloqueo cuando no hay créditos o el paquete está vencido
  describe('AC-2: Bloqueo por Saldo Agotado o Vencido', () => {
    it('debe rechazar la asistencia si el alumno no cuenta con paquete activo con crédito > 0', async () => {
      const mockSession = {
        id: 'session-123',
        capacity: 12,
        attendances: [],
      };

      prisma.session.findUnique.mockResolvedValue(mockSession);
      // No encuentra paquete válido (ya sea por créditos = 0 o fecha expirada)
      prisma.package.findFirst.mockResolvedValue(null);

      await expect(
        AttendanceService.recordAttendance({
          sessionId: 'session-123',
          studentId: 'student-no-credits',
          instructorId: 'inst-1',
        })
      ).rejects.toThrow('CRÉDITO AGOTADO O VENCIDO');

      expect(prisma.package.update).not.toHaveBeenCalled();
      expect(prisma.attendance.create).not.toHaveBeenCalled();
    });
  });

  // AC-3: Restricción estricta de cupo (12/12)
  describe('AC-3: Restricción Estricta de Cupo en Walk-in / Registro', () => {
    it('debe denegar el check-in si la sesión ya cuenta con 12 personas presentes', async () => {
      const mockFullSession = {
        id: 'session-123',
        capacity: 12,
        attendances: Array(12).fill({ status: AttendanceStatus.ATTENDED }),
      };

      prisma.session.findUnique.mockResolvedValue(mockFullSession);

      await expect(
        AttendanceService.recordAttendance({
          sessionId: 'session-123',
          studentId: 'student-walkin',
          instructorId: 'inst-1',
          isWalkIn: true,
        })
      ).rejects.toThrow('Cupo completo (12/12). Solo disponible registro en Lista de Espera');

      expect(prisma.package.findFirst).not.toHaveBeenCalled();
      expect(prisma.package.update).not.toHaveBeenCalled();
      expect(prisma.attendance.create).not.toHaveBeenCalled();
    });
  });

  // AC-4: Deshacer Operativo (Undo) dentro y fuera de la ventana de 60s
  describe('AC-4: Deshacer Operativo / Undo Inmediato', () => {
    it('debe restaurar el crédito y marcar como REVERTED dentro de la ventana de 60 segundos', async () => {
      const now = new Date('2026-10-29T18:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);

      const mockAttendance = {
        id: 'att-001',
        packageId: 'pkg-1',
        status: AttendanceStatus.ATTENDED,
        createdAt: new Date('2026-10-29T17:59:30Z'), // Creado hace 30 segundos
      };

      prisma.attendance.findUnique.mockResolvedValue(mockAttendance);
      prisma.package.update.mockResolvedValue({ id: 'pkg-1', remainingCredits: 3 });
      prisma.attendance.update.mockResolvedValue({
        ...mockAttendance,
        status: AttendanceStatus.REVERTED,
      });

      const result = await AttendanceService.undoAttendance('att-001');

      expect(prisma.package.update).toHaveBeenCalledWith({
        where: { id: 'pkg-1' },
        data: { remainingCredits: { increment: 1 } },
      });

      expect(prisma.attendance.update).toHaveBeenCalledWith({
        where: { id: 'att-001' },
        data: { status: AttendanceStatus.REVERTED },
      });

      expect(result.status).toBe(AttendanceStatus.REVERTED);
    });

    it('debe rechazar la reversión si han transcurrido más de 60 segundos', async () => {
      const now = new Date('2026-10-29T18:02:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);

      const mockAttendance = {
        id: 'att-001',
        packageId: 'pkg-1',
        status: AttendanceStatus.ATTENDED,
        createdAt: new Date('2026-10-29T18:00:00Z'), // Creado hace 120 segundos
      };

      prisma.attendance.findUnique.mockResolvedValue(mockAttendance);

      await expect(AttendanceService.undoAttendance('att-001')).rejects.toThrow(
        'Ventana de reversión expirada (máximo 60 segundos)'
      );

      expect(prisma.package.update).not.toHaveBeenCalled();
      expect(prisma.attendance.update).not.toHaveBeenCalled();
    });

    it('debe rechazar la reversión si el registro ya se encuentra REVERTED', async () => {
      const mockAttendance = {
        id: 'att-001',
        packageId: 'pkg-1',
        status: AttendanceStatus.REVERTED,
        createdAt: new Date(),
      };

      prisma.attendance.findUnique.mockResolvedValue(mockAttendance);

      await expect(AttendanceService.undoAttendance('att-001')).rejects.toThrow(
        'Registro no válido para reversión'
      );

      expect(prisma.package.update).not.toHaveBeenCalled();
      expect(prisma.attendance.update).not.toHaveBeenCalled();
    });
  });
});