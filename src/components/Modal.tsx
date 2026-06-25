import React from 'react';
import { X } from 'lucide-react';

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  hideClose?: boolean;
};

export default function Modal({ isOpen, onClose, title, children, hideClose = false }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content">
        {(title || !hideClose) && (
          <div className="flex items-center justify-between p-4 border-b border-charcoal-700">
            {title && <h2 className="text-lg font-bold text-charcoal-100">{title}</h2>}
            {!hideClose && (
              <button
                onClick={onClose}
                className="ml-auto p-1.5 rounded-lg hover:bg-charcoal-700 text-charcoal-400 hover:text-charcoal-100 transition-colors"
              >
                <X size={20} />
              </button>
            )}
          </div>
        )}
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
