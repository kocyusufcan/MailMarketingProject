import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type AlertType = 'success' | 'error' | 'info' | 'warning' | 'confirm';

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message: string;
  type: AlertType;
  showCancel?: boolean;
  cancelText?: string;
  confirmText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

const { width } = Dimensions.get('window');

const CustomAlert: React.FC<CustomAlertProps> = ({ 
  visible, title, message, type, showCancel, cancelText = 'Vazgeç', confirmText = 'Anladım', onConfirm, onCancel 
}) => {
  const [scaleAnim] = React.useState(new Animated.Value(0));

  React.useEffect(() => {
    if (visible) {
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
        tension: 40,
      }).start();
    } else {
      scaleAnim.setValue(0);
    }
  }, [visible]);

  const getIcon = () => {
    switch (type) {
      case 'success': return { name: 'checkmark-circle' as const, color: '#10b981', bg: '#ecfdf5' };
      case 'error': return { name: 'alert-circle' as const, color: '#ef4444', bg: '#fef2f2' };
      case 'warning': return { name: 'warning' as const, color: '#f59e0b', bg: '#fffbeb' };
      case 'confirm': return { name: 'help-circle' as const, color: '#4f46e5', bg: '#eef2ff' };
      default: return { name: 'information-circle' as const, color: '#3b82f6', bg: '#eff6ff' };
    }
  };

  const iconConfig = getIcon();

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.overlay}>
        <Animated.View style={[styles.alertBox, { transform: [{ scale: scaleAnim }] }]}>
          <View style={[styles.iconContainer, { backgroundColor: iconConfig.bg }]}>
            <Ionicons name={iconConfig.name} size={40} color={iconConfig.color} />
          </View>
          
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          
          <View style={[styles.buttonRow, showCancel ? styles.rowMode : styles.columnMode]}>
            {showCancel && (
              <TouchableOpacity 
                activeOpacity={0.7} 
                style={[styles.button, styles.cancelButton]} 
                onPress={onCancel}
              >
                <Text style={styles.cancelButtonText}>{cancelText}</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity 
              activeOpacity={0.8} 
              style={[styles.button, { backgroundColor: type === 'error' ? '#ef4444' : '#4f46e5' }, showCancel && { flex: 1.5 }]} 
              onPress={onConfirm}
            >
              <Text style={styles.buttonText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertBox: {
    width: width * 0.85,
    backgroundColor: '#fff',
    borderRadius: 30,
    padding: 25,
    alignItems: 'center',
    elevation: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 10,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 25,
    paddingHorizontal: 10,
  },
  buttonRow: {
    width: '100%',
    gap: 12,
  },
  rowMode: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  columnMode: {
    flexDirection: 'column',
  },
  button: {
    paddingVertical: 16,
    borderRadius: 15,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelButtonText: {
    color: '#64748b',
    fontSize: 15,
    fontWeight: '600',
  }
});

export default CustomAlert;
