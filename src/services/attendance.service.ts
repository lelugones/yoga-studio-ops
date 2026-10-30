import { PrismaClient, AttendanceStatus } from '@prisma/client';

const prisma = new PrismaClient();

export class AttendanceService {
  /**
   * Ejecuta el check-in cumpliendo AC-1, AC-2 y AC-3 en una transacción aislada.
   */
  static async recordAttendance(params: {
    sessionId: string;
    studentId: string;
    instructorId: string;
    isWalkIn?: boolean;
  }) {
    const { sessionId, studentId, instructorId, isWalkIn } = params;

    return await prisma.$transaction(async (tx) => {
      // 1. Validar Capacidad de la sesión (AC-3)
      const session = await tx.session.findUnique({
        where: { id: sessionId },
        include: {
          attendances: { where: { status: AttendanceStatus.ATTENDED } }
        }
      });

      if (!session) throw new Error('Sesión no encontrada');

      if (session.attendances.length >= session.capacity) {
        throw new Error(
          `Cupo completo (${session.capacity}/${session.capacity}). Solo disponible registro en Lista de Espera`
        );
      }

      // 2. Buscar paquete activo con saldo y vigencia (AC-2)
      const now = new Date();
      const activePackage = await tx.package.findFirst({
        where: {
          studentId,
          isActive: true,
          remainingCredits: { gt: 0 },
          expiresAt: { gte: now }
        },
        orderBy: { expiresAt: 'asc' } // Consume primero el más próximo a vencer
      });

      if (!activePackage) {
        throw new Error('CRÉDITO AGOTADO O VENCIDO');
      }

      // 3. Decrementar saldo de forma atómica (AC-1)
      const updatedPackage = await tx.package.update({
        where: { id: activePackage.id },
        data: {
          remainingCredits: { decrement: 1 }
        }
      });

      // 4. Registrar asistencia en el log de auditoría (AC-1)
      const attendance = await tx.attendance.create({
        data: {
          sessionId,
          studentId,
          packageId: activePackage.id,
          instructorId,
          status: AttendanceStatus.ATTENDED
        }
      });

      return {
        success: true,
        attendanceId: attendance.id,
        remainingCredits: updatedPackage.remainingCredits,
        alertLowCredits: updatedPackage.remainingCredits <= 2
      };
    });
  }

  /**
   * Permite revertir el check-in dentro de los 60 segundos (AC-4)
   */
  static async undoAttendance(attendanceId: string) {
    return await prisma.$transaction(async (tx) => {
      const attendance = await tx.attendance.findUnique({
        where: { id: attendanceId }
      });

      if (!attendance || attendance.status === AttendanceStatus.REVERTED) {
        throw new Error('Registro no válido para reversión');
      }

      const diffInSeconds = (Date.now() - attendance.createdAt.getTime()) / 1000;
      if (diffInSeconds > 60) {
        throw new Error('Ventana de reversión expirada (máximo 60 segundos)');
      }

      // Restaurar crédito
      await tx.package.update({
        where: { id: attendance.packageId },
        data: { remainingCredits: { increment: 1 } }
      });

      // Marcar registro como revertido
      return await tx.attendance.update({
        where: { id: attendanceId },
        data: { status: AttendanceStatus.REVERTED }
      });
    });
  }
}