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
        return `Hola ${studentName} 🙏 Te escribimos del estudio de yoga. Lamentablemente debemos cancelar la clase de ${sessionDate} a las ${sessionTime} debido a que ${instructorName} se encuentra indispuesta por salud. Tu crédito no fue descontado. Te pedimos disculpas y esperamos verte en la próxima sesión.`;
      case 'substitute_instructor':
        return `Hola ${studentName} 🙏 Te avisamos que la clase de ${sessionDate} a las ${sessionTime} se dictará con normalidad pero estará a cargo de ${substituteName} en reemplazo de ${instructorName}. Tu lugar sigue confirmado. ¡Te esperamos!`;
      case 'schedule_delay':
        return `Hola ${studentName} 🙏 Te informamos un imprevisto operativo para la clase de ${sessionDate} con ${instructorName}: el inicio se retrasa unos minutos. Tu lugar sigue confirmado y tu crédito no será descontado. ¡Gracias por tu paciencia!`;
    }
  };

  const buildWhatsAppUrl = (phone: string, message: string) =>
    `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;

  const handleOpenWhatsApp = (recipient: Recipient) => {
    window.open(buildWhatsAppUrl(recipient.phone, generateMessage(recipient.fullName)), '_blank', 'noopener,noreferrer');
    setContactedIds((prev) => new Set(prev).add(recipient.id));
  };

  const handleCopy = async (recipient: Recipient, index: number) => {
    await navigator.clipboard.writeText(generateMessage(recipient.fullName));
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const templates: { id: TemplateType; label: string; icon: React.ReactNode }[] = [
    { id: 'illness_cancel', label: 'Cancelación por salud', icon: <AlertCircle className="h-4 w-4" /> },
    { id: 'substitute_instructor', label: 'Suplencia', icon: <UserX className="h-4 w-4" /> },
    { id: 'schedule_delay', label: 'Retraso de horario', icon: <Clock className="h-4 w-4" /> },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#2A3430]/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="broadcast-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-2xl bg-[#FBF9F5] shadow-[0_4px_20px_-4px_rgba(42,52,48,0.06)] sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-[#EBE6DD] px-4 py-3.5">
          <div>
            <h2 id="broadcast-title" className="font-serif text-lg font-semibold text-[#2A3430]">
              Aviso urgente
            </h2>
            <p className="text-xs text-[#6B7570]">
              {sessionDate} · {sessionTime} · {instructorName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-[#6B7570] hover:bg-white"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-4 overflow-y-auto px-4 py-4">
          <div className="grid gap-2">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => setSelectedTemplate(template.id)}
                className={`flex h-11 items-center gap-2 rounded-xl border px-3 text-sm font-medium ${
                  selectedTemplate === template.id
                    ? 'border-[#3D5A50] bg-[#3D5A50] text-white'
                    : 'border-[#EBE6DD] bg-white text-[#2A3430]'
                }`}
              >
                {template.icon}
                {template.label}
              </button>
            ))}
          </div>

          {selectedTemplate === 'substitute_instructor' && (
            <label className="block text-xs font-medium text-[#6B7570]">
              Instructora suplente
              <input
                value={substituteName}
                onChange={(e) => setSubstituteName(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-[#EBE6DD] bg-white px-3 text-sm text-[#2A3430]"
              />
            </label>
          )}

          <ul className="space-y-2">
            {recipients.map((recipient, index) => {
              const contacted = contactedIds.has(recipient.id);
              return (
                <li
                  key={recipient.id}
                  className="flex items-center justify-between gap-2 rounded-2xl border border-[#EBE6DD] bg-white p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#2A3430]">{recipient.fullName}</p>
                    <p className="text-xs text-[#6B7570]">
                      {recipient.status === 'WAITLIST' ? 'Lista de espera' : 'Reservada'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleCopy(recipient, index)}
                      aria-label={`Copiar mensaje para ${recipient.fullName}`}
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#EBE6DD] text-[#6B7570] hover:bg-[#FBF9F5]"
                    >
                      {copiedIndex === index ? <CheckCheck className="h-4 w-4 text-[#3D6B52]" /> : <Copy className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenWhatsApp(recipient)}
                      className={`flex h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-medium ${
                        contacted ? 'bg-[#EAF3EE] text-[#3D6B52]' : 'bg-[#3D5A50] text-white hover:bg-[#324B42]'
                      }`}
                    >
                      {contacted ? <CheckCheck className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
                      {contacted ? 'Enviado' : 'WhatsApp'}
                      {!contacted && <ExternalLink className="h-3 w-3" />}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <footer className="flex items-center gap-2 border-t border-[#EBE6DD] px-4 py-3 text-xs text-[#6B7570]">
          <Send className="h-3.5 w-3.5" />
          {contactedIds.size}/{recipients.length} alumnas avisadas
        </footer>
      </div>
    </div>
  );
};
