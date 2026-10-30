'use client';

import React, { useState } from 'react';
import { 
  X, 
  MessageCircle, 
  Send, 
  AlertCircle, 
  CheckCheck, 
  Copy, 
  Clock, 
  UserX, 
  Sparkles,
  ExternalLink
} from 'lucide-react';

interface Recipient {
  id: string;
  fullName: string;
  phone: string; // formato internacional o estándar local (ej: +5493871234567)
  status: 'RESERVED' | 'WAITLIST';
}

interface EmergencyBroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionTime: string;
  sessionDate?: string;
  instructorName: string;
  recipients: Recipient[];
}

type TemplateType = 'illness_cancel' | 'substitute_instructor' | 'schedule_delay';

export const EmergencyBroadcastModal: React.FC<EmergencyBroadcastModalProps> = ({
  isOpen,
  onClose,
  sessionTime = '19:00',
  sessionDate = 'hoy',
  instructorName = 'Clara M.',
  recipients = [],
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('illness_cancel');
  const [substituteName, setSubstituteName] = useState('Andrea');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [contactedIds, setContactedIds] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  // Generación de mensajes según plantilla y destinatario
  const generateMessage = (studentName: string) => {
    switch (selectedTemplate) {
      case 'illness_cancel':
        return `Hola ${studentName} 🙏 Te escribimos del estudio de yoga. Lamentablemente debemos cancelar la clase de ${sessionDate} a las ${sessionTime} debido a que${instructorName} se encuentra indispuesta por salud. Tu crédito no fue descontado. Te pedimos disculpas y esperamos verte en la próxima sesión.`;
      case 'substitute_instructor':
        return `Hola ${studentName} 🙏 Te avisamos que la clase de ${sessionDate} a las${sessionTime} se dictará con normalidad pero estará a cargo de ${substituteName} en reemplazo de${instructorName}. Tu lugar sigue confirmado. ¡Te esperamos!`;
      case 'schedule_delay':
        return `Hola ${studentName} 🙏 Te informamos un imprevisto operativo para la clase de ${sessionDate} con${instructorName}: el inicio