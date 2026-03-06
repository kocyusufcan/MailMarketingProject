import React, { createContext, useContext, useState, useCallback } from 'react';
import CustomAlert, { AlertType } from '../components/CustomAlert';

interface AlertOptions {
  title: string;
  message: string;
  type?: AlertType;
  showCancel?: boolean;
  cancelText?: string;
  confirmText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface AlertContextData {
  showAlert: (options: AlertOptions) => void;
  hideAlert: () => void;
}

const AlertContext = createContext<AlertContextData>({} as AlertContextData);

export const AlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [visible, setVisible] = useState(false);
  const [options, setOptions] = useState<AlertOptions>({ title: '', message: '', type: 'error' });

  const showAlert = useCallback((opts: AlertOptions) => {
    setOptions(opts);
    setVisible(true);
  }, []);

  const hideAlert = useCallback(() => {
    setVisible(false);
  }, []);

  const handleConfirm = useCallback(() => {
    setVisible(false);
    if (options.onConfirm) {
      options.onConfirm();
    }
  }, [options]);

  const handleCancel = useCallback(() => {
    setVisible(false);
    if (options.onCancel) {
      options.onCancel();
    }
  }, [options]);

  return (
    <AlertContext.Provider value={{ showAlert, hideAlert }}>
      {children}
      <CustomAlert
        visible={visible}
        title={options.title}
        message={options.message}
        type={options.type || 'error'}
        showCancel={options.showCancel}
        cancelText={options.cancelText}
        confirmText={options.confirmText}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </AlertContext.Provider>
  );
};

export const useAlert = () => useContext(AlertContext);
